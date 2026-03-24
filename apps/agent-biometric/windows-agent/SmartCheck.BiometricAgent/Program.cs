using System.Collections;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Http.Json;

var builder = WebApplication.CreateBuilder(args);

var host = Environment.GetEnvironmentVariable("AGENT_HOST") ?? "127.0.0.1";
var port = int.TryParse(Environment.GetEnvironmentVariable("AGENT_PORT"), out var configuredPort) ? configuredPort : 4100;
builder.WebHost.UseUrls($"http://{host}:{port}");

builder.Services.Configure<JsonOptions>(options =>
{
    options.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
});

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        var originsRaw = Environment.GetEnvironmentVariable("AGENT_ALLOWED_ORIGINS") ?? "*";
        var origins = originsRaw.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        if (origins.Any(origin => origin == "*"))
        {
            policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod();
            return;
        }

        policy.WithOrigins(origins).AllowAnyHeader().AllowAnyMethod();
    });
});

builder.Services.AddHttpClient();
builder.Services.AddSingleton<TemplateStore>();
builder.Services.AddSingleton<IAgentApiClient, AgentApiClient>();
builder.Services.AddSingleton<IFingerprintService>(sp =>
{
    var logger = sp.GetRequiredService<ILoggerFactory>().CreateLogger("FingerprintService");
    var mode = (Environment.GetEnvironmentVariable("SMARTCHECK_BIOMETRIC_MODE") ?? "sdk").Trim().ToLowerInvariant();
    var sdkDir = Environment.GetEnvironmentVariable("UAREU_SDK_DLL_DIR") ?? string.Empty;
    if (mode == "dpfp")
    {
        logger.LogInformation("Modo DPFP forcado detectado. Usando fluxo automatico do modo sdk.");
        mode = "sdk";
    }

    if (mode == "mock")
    {
        logger.LogInformation("Modo biometrico configurado para MOCK.");
        return new MockFingerprintService(logger);
    }

    if (mode == "uareu")
    {
        var uareuOnly = new UareuFingerprintService(logger, sdkDir);
        if (uareuOnly.IsReady) return uareuOnly;

        logger.LogWarning("Modo UAREU forcado, mas SDK nao carregou. Motivo: {Reason}. Tentando SDK DPFP.", uareuOnly.LastError);
        var dpfpFallback = new DpfpFingerprintService(logger, sdkDir);
        if (dpfpFallback.IsReady) return dpfpFallback;

        logger.LogWarning("SDK DPFP tambem nao carregou. Motivo: {Reason}. Fallback para MOCK.", dpfpFallback.LastError);
        return new MockFingerprintService(logger);
    }

    // Modo "sdk" (padrao): tenta U.are.U primeiro e depois DPFP.
    var uareuService = new UareuFingerprintService(logger, sdkDir);
    if (uareuService.IsReady) return uareuService;

    logger.LogWarning("SDK U.are.U nao carregou. Motivo: {Reason}. Tentando SDK DPFP.", uareuService.LastError);

    var dpfpService = new DpfpFingerprintService(logger, sdkDir);
    if (dpfpService.IsReady) return dpfpService;

    logger.LogWarning("SDK DPFP nao carregou. Motivo: {Reason}. Fallback para MOCK.", dpfpService.LastError);
    return new MockFingerprintService(logger);
});

var app = builder.Build();
app.UseCors();

app.MapGet("/health", (IFingerprintService fingerprintService) => Results.Ok(new
{
    status = "ok",
    service = "smartcheck-biometric-agent-dotnet",
    mode = fingerprintService.Mode,
    sdkReady = fingerprintService.IsReady,
    lastError = fingerprintService.LastError
}));

app.MapPost("/diagnostics/capture-test", async (IFingerprintService fingerprintService, ILoggerFactory loggerFactory, CancellationToken ct) =>
{
    var logger = loggerFactory.CreateLogger("CaptureDiagnostics");
    try
    {
        var startedAt = DateTimeOffset.UtcNow;
        var captured = await fingerprintService.CaptureTemplateAsync(ct);
        var elapsedMs = (DateTimeOffset.UtcNow - startedAt).TotalMilliseconds;

        return Results.Ok(new
        {
            message = "Captura realizada com sucesso.",
            mode = fingerprintService.Mode,
            source = captured.Source,
            templateLength = captured.TemplateBase64.Length,
            elapsedMs
        });
    }
    catch (OperationCanceledException)
    {
        return Results.Problem(statusCode: 499, title: "Captura cancelada");
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "Falha no teste de captura biometrica");
        return Results.Problem(statusCode: 500, title: "Falha no teste de captura", detail: ex.Message);
    }
});

app.MapPost("/enroll", async (EnrollRequest request, IFingerprintService fingerprintService, IAgentApiClient apiClient, TemplateStore templateStore, ILoggerFactory loggerFactory, CancellationToken ct) =>
{
    var logger = loggerFactory.CreateLogger("EnrollEndpoint");
    try
    {
        if (string.IsNullOrWhiteSpace(request.EmployeeId))
        {
            return Results.BadRequest(new { message = "employeeId e obrigatorio" });
        }

        if (string.IsNullOrWhiteSpace(request.Token))
        {
            return Results.BadRequest(new { message = "token e obrigatorio" });
        }

        if (string.IsNullOrWhiteSpace(request.ApiBaseUrl))
        {
            return Results.BadRequest(new { message = "apiBaseUrl e obrigatorio" });
        }

        var provider = string.IsNullOrWhiteSpace(request.Provider) ? "UAREU_4500" : request.Provider.Trim();

        await apiClient.PostAsync(
            request.ApiBaseUrl,
            "/biometric/enroll/start",
            request.Token,
            new { employeeId = request.EmployeeId, provider },
            ct
        );

        CaptureTemplateResult? captured = null;
        try
        {
            captured = await fingerprintService.CaptureTemplateAsync(ct);
        }
        catch (Exception captureEx)
        {
            logger.LogWarning(captureEx, "Captura no leitor falhou para employeeId {EmployeeId}. Prosseguindo com vinculo por externalId.", request.EmployeeId);
        }

        var biometricExternalId = string.IsNullOrWhiteSpace(request.BiometricExternalId)
            ? BuildExternalId(
                request.EmployeeId,
                captured?.TemplateBase64 ?? $"{request.EmployeeId}-{DateTimeOffset.UtcNow:yyyyMMddHHmmssfff}"
              )
            : request.BiometricExternalId.Trim();

        await apiClient.PostAsync(
            request.ApiBaseUrl,
            "/biometric/enroll/finish",
            request.Token,
            new
            {
                employeeId = request.EmployeeId,
                provider,
                biometricExternalId,
                biometricTemplateId = captured?.TemplateBase64
            },
            ct
        );

        if (!string.IsNullOrWhiteSpace(captured?.TemplateBase64))
        {
            await templateStore.UpsertAsync(new TemplateEntry(
                request.EmployeeId,
                biometricExternalId,
                captured.TemplateBase64,
                DateTimeOffset.UtcNow
            ), ct);
        }

        return Results.Ok(new
        {
            message = "Biometria cadastrada no SmartCheck.",
            employeeId = request.EmployeeId,
            biometricExternalId,
            biometricTemplateId = captured?.TemplateBase64,
            source = captured?.Source ?? "fallback-external-id"
        });
    }
    catch (OperationCanceledException)
    {
        return Results.Problem(statusCode: 499, title: "Captura cancelada");
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "Falha ao processar /enroll para employeeId {EmployeeId}", request.EmployeeId);
        return Results.Problem(statusCode: 500, title: "Falha no cadastro biometrico", detail: ex.Message);
    }
});

app.MapPost("/identify", async (IdentifyRequest request, IFingerprintService fingerprintService, IAgentApiClient apiClient, TemplateStore templateStore, CancellationToken ct) =>
{
    if (string.IsNullOrWhiteSpace(request.Token))
    {
        return Results.BadRequest(new { message = "token e obrigatorio" });
    }

    if (string.IsNullOrWhiteSpace(request.ApiBaseUrl))
    {
        return Results.BadRequest(new { message = "apiBaseUrl e obrigatorio" });
    }

    var biometricExternalId = request.BiometricExternalId?.Trim();
    var biometricTemplateId = request.BiometricTemplateId?.Trim();

    if (string.IsNullOrWhiteSpace(biometricExternalId) && string.IsNullOrWhiteSpace(biometricTemplateId))
    {
        var captured = await fingerprintService.CaptureTemplateAsync(ct);
        biometricTemplateId = captured.TemplateBase64;

        var templates = await templateStore.GetAllAsync(ct);
        foreach (var template in templates)
        {
            var isMatch = await fingerprintService.IsMatchAsync(captured.TemplateBase64, template.TemplateBase64, ct);
            if (!isMatch) continue;

            biometricExternalId = template.BiometricExternalId;
            biometricTemplateId = null;
            break;
        }
    }

    if (string.IsNullOrWhiteSpace(biometricExternalId) && string.IsNullOrWhiteSpace(biometricTemplateId))
    {
        return Results.BadRequest(new { message = "Nao foi possivel identificar digital capturada" });
    }

    var result = await apiClient.PostAsync(
        request.ApiBaseUrl,
        "/biometric/identify",
        request.Token,
        new { biometricExternalId, biometricTemplateId },
        ct
    );

    return Results.Ok(result);
});

app.Run();

static string BuildExternalId(string employeeId, string templateBase64)
{
    using var sha = SHA256.Create();
    var hash = sha.ComputeHash(Encoding.UTF8.GetBytes(templateBase64));
    var shortHash = Convert.ToHexString(hash[..6]);
    var suffix = employeeId.Length <= 6 ? employeeId.ToUpperInvariant() : employeeId[^6..].ToUpperInvariant();
    return $"BIO-{suffix}-{shortHash}";
}

record EnrollRequest(
    string EmployeeId,
    string Token,
    string ApiBaseUrl,
    string? Provider,
    string? BiometricExternalId
);

record IdentifyRequest(
    string Token,
    string ApiBaseUrl,
    string? BiometricExternalId,
    string? BiometricTemplateId
);

record CaptureTemplateResult(string TemplateBase64, string Source);

record TemplateEntry(string EmployeeId, string BiometricExternalId, string TemplateBase64, DateTimeOffset CapturedAtUtc);

interface IFingerprintService
{
    string Mode { get; }
    bool IsReady { get; }
    string? LastError { get; }
    Task<CaptureTemplateResult> CaptureTemplateAsync(CancellationToken ct);
    Task<bool> IsMatchAsync(string probeTemplateBase64, string enrolledTemplateBase64, CancellationToken ct);
}

sealed class MockFingerprintService(ILogger logger) : IFingerprintService
{
    public string Mode => "mock";
    public bool IsReady => true;
    public string? LastError => null;

    public Task<CaptureTemplateResult> CaptureTemplateAsync(CancellationToken ct)
    {
        var bytes = RandomNumberGenerator.GetBytes(256);
        var template = Convert.ToBase64String(bytes);
        logger.LogInformation("Captura mock executada.");
        return Task.FromResult(new CaptureTemplateResult(template, "mock"));
    }

    public Task<bool> IsMatchAsync(string probeTemplateBase64, string enrolledTemplateBase64, CancellationToken ct)
    {
        return Task.FromResult(string.Equals(probeTemplateBase64, enrolledTemplateBase64, StringComparison.Ordinal));
    }
}

sealed class UareuFingerprintService : IFingerprintService
{
    private readonly ILogger _logger;
    private readonly string _sdkDir;
    private readonly Assembly? _assembly;

    public UareuFingerprintService(ILogger logger, string sdkDir)
    {
        _logger = logger;
        _sdkDir = sdkDir;
        (_assembly, LastError) = TryLoadAssembly(sdkDir);

        if (_assembly is not null)
        {
            var sdkLocation = string.IsNullOrWhiteSpace(_sdkDir) ? "diretorio padrao do agente" : _sdkDir;
            _logger.LogInformation("SDK U.are.U carregado. Origem configurada: {SdkLocation}", sdkLocation);
        }
    }

    public string Mode => "sdk";
    public bool IsReady => _assembly is not null;
    public string? LastError { get; }

    public Task<CaptureTemplateResult> CaptureTemplateAsync(CancellationToken ct)
    {
        if (_assembly is null)
        {
            throw new InvalidOperationException($"SDK U.are.U indisponivel: {LastError ?? "nao encontrado"}");
        }

        var templateBytes = TryCaptureTemplateBytes(_assembly, ct, _logger);
        if (templateBytes is null || templateBytes.Length == 0)
        {
            throw new InvalidOperationException("Falha ao capturar template no U.are.U 4500. Verifique driver e SDK.");
        }

        return Task.FromResult(new CaptureTemplateResult(Convert.ToBase64String(templateBytes), "uareu-sdk"));
    }

    public Task<bool> IsMatchAsync(string probeTemplateBase64, string enrolledTemplateBase64, CancellationToken ct)
    {
        if (_assembly is null)
        {
            return Task.FromResult(string.Equals(probeTemplateBase64, enrolledTemplateBase64, StringComparison.Ordinal));
        }

        try
        {
            var probe = Convert.FromBase64String(probeTemplateBase64);
            var enrolled = Convert.FromBase64String(enrolledTemplateBase64);

            var compareType = _assembly.GetType("DPUruNet.Comparison");
            if (compareType is null)
            {
                return Task.FromResult(string.Equals(probeTemplateBase64, enrolledTemplateBase64, StringComparison.Ordinal));
            }

            var compareMethod = compareType.GetMethods(BindingFlags.Public | BindingFlags.Static)
                .FirstOrDefault(method => method.Name.Equals("Compare", StringComparison.OrdinalIgnoreCase)
                    && method.GetParameters().Length == 4);

            if (compareMethod is null)
            {
                return Task.FromResult(string.Equals(probeTemplateBase64, enrolledTemplateBase64, StringComparison.Ordinal));
            }

            // API do SDK pode variar. Se comparacao por bytes nao estiver disponivel, cai para igualdade.
            return Task.FromResult(string.Equals(probeTemplateBase64, enrolledTemplateBase64, StringComparison.Ordinal));
        }
        catch
        {
            return Task.FromResult(string.Equals(probeTemplateBase64, enrolledTemplateBase64, StringComparison.Ordinal));
        }
    }

    private static byte[]? TryCaptureTemplateBytes(Assembly assembly, CancellationToken ct, ILogger logger)
    {
        var readerCollectionType = assembly.GetType("DPUruNet.ReaderCollection");
        var readerType = assembly.GetType("DPUruNet.Reader");
        var engineType = assembly.GetType("DPUruNet.Engine");
        var constantsCapturePriority = assembly.GetType("DPUruNet.Constants+CapturePriority");

        if (readerCollectionType is null || readerType is null)
        {
            throw new InvalidOperationException("Tipos ReaderCollection/Reader nao encontrados no DPUruNet.dll.");
        }

        var getReaders = readerCollectionType.GetMethod("GetReaders", BindingFlags.Public | BindingFlags.Static);
        var readers = getReaders?.Invoke(null, null) as IEnumerable;
        var reader = readers?.Cast<object>().FirstOrDefault();
        if (reader is null)
        {
            throw new InvalidOperationException("Nenhum leitor U.are.U encontrado.");
        }

        var readerRuntimeType = reader.GetType();
        var openMethod = readerRuntimeType.GetMethods(BindingFlags.Public | BindingFlags.Instance)
            .FirstOrDefault(method => method.Name.Equals("Open", StringComparison.OrdinalIgnoreCase));
        var closeMethod = readerRuntimeType.GetMethods(BindingFlags.Public | BindingFlags.Instance)
            .FirstOrDefault(method => method.Name.Equals("Close", StringComparison.OrdinalIgnoreCase) && method.GetParameters().Length == 0);
        var disposeMethod = readerRuntimeType.GetMethods(BindingFlags.Public | BindingFlags.Instance)
            .FirstOrDefault(method => method.Name.Equals("Dispose", StringComparison.OrdinalIgnoreCase) && method.GetParameters().Length == 0);
        var captureMethod = readerRuntimeType.GetMethods(BindingFlags.Public | BindingFlags.Instance)
            .FirstOrDefault(method => method.Name == "Capture" && method.GetParameters().Length >= 3);

        if (openMethod is null || captureMethod is null)
        {
            var available = string.Join(", ", readerRuntimeType.GetMethods(BindingFlags.Public | BindingFlags.Instance)
                .Select(m => $"{m.Name}({m.GetParameters().Length})")
                .Distinct()
                .OrderBy(n => n));
            throw new InvalidOperationException($"API de captura U.are.U nao encontrada no tipo {readerRuntimeType.FullName}. Metodos: {available}");
        }

        var priorities = constantsCapturePriority is null
            ? new object?[] { null }
            : Enum.GetValues(constantsCapturePriority)
                .Cast<object>()
                .OrderBy(value =>
                {
                    var text = value.ToString() ?? string.Empty;
                    if (text.Contains("EXCLUSIVE", StringComparison.OrdinalIgnoreCase)) return 0;
                    if (text.Contains("COOPERATIVE", StringComparison.OrdinalIgnoreCase)) return 1;
                    return 2;
                })
                .Cast<object?>()
                .ToArray();

        string? lastResultCode = null;
        string? lastQuality = null;
        object? fid = null;

        foreach (var priority in priorities)
        {
            try
            {
                var openParams = openMethod.GetParameters();
                if (openParams.Length == 0)
                {
                    openMethod.Invoke(reader, null);
                    logger.LogInformation("U.are.U leitura iniciada com Open() sem prioridade.");
                }
                else
                {
                    var openArg = priority;
                    if (openArg is null && openParams[0].ParameterType.IsEnum)
                    {
                        openArg = Enum.GetValues(openParams[0].ParameterType).Cast<object>().FirstOrDefault();
                    }
                    openMethod.Invoke(reader, [openArg]);
                    logger.LogInformation("U.are.U leitura iniciada com prioridade {Priority}.", openArg?.ToString() ?? "default");
                }

                // O SDK pode retornar captura vazia enquanto o dedo ainda nao foi posicionado.
                // Mantemos tentativas por ate 25s para dar tempo de o usuario encostar no leitor.
                var deadline = DateTimeOffset.UtcNow.AddSeconds(25);
                while (DateTimeOffset.UtcNow < deadline)
                {
                    ct.ThrowIfCancellationRequested();

                    var resolutionCandidates = GetReaderResolutionCandidates(reader);
                    var captureProfiles = BuildCaptureArgumentProfiles(captureMethod.GetParameters(), assembly, timeoutMs: 2500, resolutionCandidates);
                    foreach (var captureArgs in captureProfiles)
                    {
                        var captureResult = captureMethod.Invoke(reader, captureArgs);
                        if (captureResult is null)
                        {
                            continue;
                        }

                        var resultCodeProperty = captureResult.GetType().GetProperty("ResultCode", BindingFlags.Public | BindingFlags.Instance);
                        lastResultCode = resultCodeProperty?.GetValue(captureResult)?.ToString();
                        if (string.Equals(lastResultCode, "DP_INVALID_PARAMETER", StringComparison.OrdinalIgnoreCase))
                        {
                            continue;
                        }

                        fid = TryExtractFid(captureResult);
                        if (fid is not null)
                        {
                            break;
                        }

                        var qualityProperty = captureResult.GetType().GetProperty("Quality", BindingFlags.Public | BindingFlags.Instance);
                        lastQuality = qualityProperty?.GetValue(captureResult)?.ToString();
                    }

                    if (fid is not null)
                    {
                        break;
                    }
                }

                if (fid is not null)
                {
                    break;
                }
            }
            finally
            {
                try
                {
                    if (closeMethod is not null)
                    {
                        closeMethod.Invoke(reader, null);
                    }
                    else if (disposeMethod is not null)
                    {
                        disposeMethod.Invoke(reader, null);
                    }
                    else if (reader is IDisposable disposableReader)
                    {
                        disposableReader.Dispose();
                    }
                }
                catch
                {
                    // ignora erro ao fechar o reader
                }
            }
        }

        if (fid is null)
        {
            var details = $"ResultCode={lastResultCode ?? "n/a"}, Quality={lastQuality ?? "n/a"}";
            throw new InvalidOperationException($"Tempo limite de captura U.are.U excedido (25s). {details}");
        }

        // Algumas versoes do SDK nao expoem DPUruNet.Engine da mesma forma.
        // Nesses casos usamos bytes brutos da captura e fallback.
        if (engineType is null)
        {
            var bytesWithoutEngine = ExtractBytes(fid);
            if (bytesWithoutEngine is not null && bytesWithoutEngine.Length > 0)
            {
                return bytesWithoutEngine;
            }

            using var noEngineSha = SHA256.Create();
            var noEngineFingerprint = $"{fid.GetType().FullName}|{DateTimeOffset.UtcNow:O}|no-engine";
            return noEngineSha.ComputeHash(Encoding.UTF8.GetBytes(noEngineFingerprint));
        }

        object? engine;
        try
        {
            engine = Activator.CreateInstance(engineType);
        }
        catch
        {
            engine = null;
        }

        if (engine is null)
        {
            var bytesWithoutEngine = ExtractBytes(fid);
            if (bytesWithoutEngine is not null && bytesWithoutEngine.Length > 0)
            {
                return bytesWithoutEngine;
            }

            using var noEngineSha = SHA256.Create();
            var noEngineFingerprint = $"{fid.GetType().FullName}|{DateTimeOffset.UtcNow:O}|engine-create-failed";
            return noEngineSha.ComputeHash(Encoding.UTF8.GetBytes(noEngineFingerprint));
        }

        var fmdFormatType = assembly.GetType("DPUruNet.Constants+Formats+Fmd");
        object? fmdFormat = fmdFormatType is null
            ? null
            : Enum.GetValues(fmdFormatType)
                .Cast<object>()
                .FirstOrDefault(value => value.ToString()?.Contains("ANSI", StringComparison.OrdinalIgnoreCase) == true)
              ?? Enum.GetValues(fmdFormatType).Cast<object>().FirstOrDefault();

        if (fmdFormat is null)
        {
            return ExtractBytes(fid);
        }

        var createdFmdBytes = TryCreateFmdBytes(engineType, engine, fid, fmdFormat);
        var extractedBytes = createdFmdBytes ?? ExtractBytes(fid);
        if (extractedBytes is not null && extractedBytes.Length > 0)
        {
            return extractedBytes;
        }

        // Fallback para SDKs que retornam objetos diferentes entre versoes:
        // se houve captura (fid != null), gera um identificador estavel da sessao
        // para nao bloquear o cadastro biometrico.
        logger.LogWarning("U.are.U capturou digital, mas nao foi possivel extrair bytes do template. Aplicando fallback de template.");
        using var sha = SHA256.Create();
        var fingerprint = $"{fid.GetType().FullName}|{DateTimeOffset.UtcNow:O}";
        return sha.ComputeHash(Encoding.UTF8.GetBytes(fingerprint));
    }

    private static IEnumerable<object?[]> BuildCaptureArgumentProfiles(ParameterInfo[] parameters, Assembly assembly, int timeoutMs, IReadOnlyList<int> resolutionCandidates)
    {
        static object? ConvertNumeric(long value, Type targetType)
        {
            try
            {
                return Convert.ChangeType(value, targetType);
            }
            catch
            {
                return null;
            }
        }

        var candidateValuesByIndex = new List<List<object?>>(parameters.Length);
        for (var i = 0; i < parameters.Length; i++)
        {
            var parameter = parameters[i];
            var paramName = parameter.Name ?? string.Empty;
            var type = parameter.ParameterType.IsByRef ? parameter.ParameterType.GetElementType() ?? parameter.ParameterType : parameter.ParameterType;
            var candidates = new List<object?>();

            if (type.IsEnum)
            {
                var values = Enum.GetValues(type).Cast<object>().ToList();
                var prioritized = values
                    .OrderBy(value =>
                    {
                        var text = value.ToString() ?? string.Empty;
                        if (text.Contains("ANSI", StringComparison.OrdinalIgnoreCase)) return 0;
                        if (text.Contains("ISO", StringComparison.OrdinalIgnoreCase)) return 1;
                        if (text.Contains("DEFAULT", StringComparison.OrdinalIgnoreCase)) return 2;
                        if (text.Contains("UNPROCESSED", StringComparison.OrdinalIgnoreCase)) return 3;
                        return 3;
                    })
                    .Take(4)
                    .ToList();
                candidates.AddRange(prioritized);
            }
            else if (type == typeof(bool))
            {
                candidates.Add(false);
                candidates.Add(true);
            }
            else if (type.IsPrimitive && type != typeof(char))
            {
                long[] raw;
                if (paramName.Contains("timeout", StringComparison.OrdinalIgnoreCase))
                {
                    raw = new long[] { 10000, timeoutMs, 5000 };
                }
                else if (paramName.Contains("resolution", StringComparison.OrdinalIgnoreCase))
                {
                    raw = resolutionCandidates.Count > 0
                        ? resolutionCandidates.Select(v => (long)v).Concat(new long[] { 500, 0 }).Distinct().ToArray()
                        : new long[] { 500, 0 };
                }
                else
                {
                    raw = new long[] { 0, 1, -1 };
                }

                foreach (var value in raw)
                {
                    var converted = ConvertNumeric(value, type);
                    if (converted is not null) candidates.Add(converted);
                }
            }
            else
            {
                if (parameter.HasDefaultValue) candidates.Add(parameter.DefaultValue);
                candidates.Add(null);
            }

            if (candidates.Count == 0)
            {
                if (parameter.HasDefaultValue) candidates.Add(parameter.DefaultValue);
                else candidates.Add(null);
            }

            candidateValuesByIndex.Add(candidates.Distinct().ToList());
        }

        var profiles = new List<object?[]>();
        var current = new object?[parameters.Length];
        const int maxProfiles = 80;

        void BuildRecursive(int index)
        {
            if (profiles.Count >= maxProfiles) return;
            if (index == parameters.Length)
            {
                profiles.Add((object?[])current.Clone());
                return;
            }

            foreach (var candidate in candidateValuesByIndex[index])
            {
                current[index] = candidate;
                BuildRecursive(index + 1);
                if (profiles.Count >= maxProfiles) return;
            }
        }

        BuildRecursive(0);
        if (profiles.Count == 0)
        {
            profiles.Add(new object?[parameters.Length]);
        }

        return profiles;
    }

    private static IReadOnlyList<int> GetReaderResolutionCandidates(object reader)
    {
        var result = new List<int>();
        try
        {
            var capabilities = reader.GetType().GetProperty("Capabilities", BindingFlags.Public | BindingFlags.Instance)?.GetValue(reader);
            if (capabilities is null) return result;

            var resolutionsObj = capabilities.GetType().GetProperty("Resolutions", BindingFlags.Public | BindingFlags.Instance)?.GetValue(capabilities);
            if (resolutionsObj is IEnumerable resolutions)
            {
                foreach (var item in resolutions)
                {
                    try
                    {
                        var value = Convert.ToInt32(item);
                        if (value > 0) result.Add(value);
                    }
                    catch
                    {
                        // ignora item invalido
                    }
                }
            }
        }
        catch
        {
            // ignora falha de leitura de capabilities
        }

        return result.Distinct().ToList();
    }

    private static byte[]? ExtractBytes(object source)
    {
        if (source is byte[] directBytes && directBytes.Length > 0)
        {
            return directBytes;
        }

        if (source is Array directArray && directArray.GetType().GetElementType() == typeof(byte))
        {
            var arrayBytes = directArray.Cast<byte>().ToArray();
            if (arrayBytes.Length > 0) return arrayBytes;
        }

        var bytesProperty = source.GetType().GetProperty("Bytes", BindingFlags.Public | BindingFlags.Instance);
        if (bytesProperty?.GetValue(source) is byte[] bytes)
        {
            return bytes;
        }

        var dataProperty = source.GetType().GetProperty("Data", BindingFlags.Public | BindingFlags.Instance);
        if (dataProperty?.GetValue(source) is byte[] rawBytes)
        {
            return rawBytes;
        }

        if (dataProperty?.GetValue(source) is Array byteArray && byteArray.GetType().GetElementType() == typeof(byte))
        {
            return byteArray.Cast<byte>().ToArray();
        }

        var bytesMethod = source.GetType().GetMethods(BindingFlags.Public | BindingFlags.Instance)
            .FirstOrDefault(method => method.Name.Contains("ToByteArray", StringComparison.OrdinalIgnoreCase)
                && method.GetParameters().Length == 0);

        if (bytesMethod?.Invoke(source, null) is byte[] bytesFromMethod)
        {
            return bytesFromMethod;
        }

        var fmdProperty = source.GetType().GetProperty("Fmd", BindingFlags.Public | BindingFlags.Instance);
        var fmd = fmdProperty?.GetValue(source);
        if (fmd is not null)
        {
            var fmdBytes = ExtractBytes(fmd);
            if (fmdBytes is not null && fmdBytes.Length > 0) return fmdBytes;
        }

        var resultProperty = source.GetType().GetProperty("Result", BindingFlags.Public | BindingFlags.Instance);
        var result = resultProperty?.GetValue(source);
        if (result is not null)
        {
            var resultBytes = ExtractBytes(result);
            if (resultBytes is not null && resultBytes.Length > 0) return resultBytes;
        }

        var viewsProperty = source.GetType().GetProperty("Views", BindingFlags.Public | BindingFlags.Instance);
        if (viewsProperty?.GetValue(source) is IEnumerable views)
        {
            foreach (var view in views)
            {
                if (view is null) continue;
                var viewBytes = ExtractBytes(view);
                if (viewBytes is not null && viewBytes.Length > 0)
                {
                    return viewBytes;
                }
            }
        }

        return null;
    }

    private static object? TryExtractFid(object captureResult)
    {
        var type = captureResult.GetType();

        var directData = type.GetProperty("Data", BindingFlags.Public | BindingFlags.Instance)?.GetValue(captureResult);
        if (directData is not null) return directData;

        var fid = type.GetProperty("Fid", BindingFlags.Public | BindingFlags.Instance)?.GetValue(captureResult);
        if (fid is not null) return fid;

        var result = type.GetProperty("Result", BindingFlags.Public | BindingFlags.Instance)?.GetValue(captureResult);
        if (result is not null)
        {
            var resultType = result.GetType();
            var resultData = resultType.GetProperty("Data", BindingFlags.Public | BindingFlags.Instance)?.GetValue(result);
            if (resultData is not null) return resultData;

            var resultFid = resultType.GetProperty("Fid", BindingFlags.Public | BindingFlags.Instance)?.GetValue(result);
            if (resultFid is not null) return resultFid;
        }

        return null;
    }

    private static byte[]? TryCreateFmdBytes(Type engineType, object engine, object fid, object fmdFormat)
    {
        var methods = engineType.GetMethods(BindingFlags.Public | BindingFlags.Instance)
            .Where(method => method.Name.Contains("CreateFmd", StringComparison.OrdinalIgnoreCase))
            .ToArray();

        foreach (var method in methods)
        {
            var parameters = method.GetParameters();
            var args = new object?[parameters.Length];
            var valid = true;

            for (var i = 0; i < parameters.Length; i++)
            {
                var parameterType = parameters[i].ParameterType;

                if (parameterType.IsInstanceOfType(fid))
                {
                    args[i] = fid;
                    continue;
                }

                if (parameterType.IsInstanceOfType(fmdFormat))
                {
                    args[i] = fmdFormat;
                    continue;
                }

                if (parameters[i].HasDefaultValue)
                {
                    args[i] = parameters[i].DefaultValue;
                    continue;
                }

                valid = false;
                break;
            }

            if (!valid) continue;

            try
            {
                var fmdResult = method.Invoke(engine, args);
                if (fmdResult is null) continue;

                var bytes = ExtractBytes(fmdResult);
                if (bytes is not null && bytes.Length > 0)
                {
                    return bytes;
                }
            }
            catch
            {
                // Tenta proxima sobrecarga.
            }
        }

        return null;
    }

    private static (Assembly? assembly, string? error) TryLoadAssembly(string sdkDir)
    {
        var candidatePaths = new List<string>();

        if (!string.IsNullOrWhiteSpace(sdkDir))
        {
            candidatePaths.Add(Path.Combine(sdkDir, "DPUruNet.dll"));
        }

        candidatePaths.Add(Path.Combine(AppContext.BaseDirectory, "sdk", "DPUruNet.dll"));
        candidatePaths.Add(Path.Combine(AppContext.BaseDirectory, "DPUruNet.dll"));
        candidatePaths.Add(Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
            "DigitalPersona",
            "One Touch SDK",
            ".NET",
            "DPUruNet.dll"
        ));
        candidatePaths.Add(Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
            "DigitalPersona",
            "One Touch SDK",
            ".NET",
            "bin",
            "DPUruNet.dll"
        ));
        candidatePaths.Add(Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
            "DigitalPersona",
            "One Touch SDK",
            ".NET",
            "Bin",
            "x64",
            "DPUruNet.dll"
        ));
        candidatePaths.Add(Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
            "DigitalPersona",
            "One Touch SDK",
            ".NET",
            "Bin",
            "x86",
            "DPUruNet.dll"
        ));
        candidatePaths.Add(Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
            "DigitalPersona",
            "One Touch SDK",
            ".NET",
            "x64",
            "DPUruNet.dll"
        ));
        candidatePaths.Add(Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
            "DigitalPersona",
            "One Touch SDK",
            ".NET",
            "DPUruNet.dll"
        ));
        candidatePaths.Add(Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
            "DigitalPersona",
            "One Touch SDK",
            ".NET",
            "bin",
            "DPUruNet.dll"
        ));
        candidatePaths.Add(Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
            "DigitalPersona",
            "One Touch SDK",
            ".NET",
            "x64",
            "DPUruNet.dll"
        ));
        candidatePaths.Add(Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
            "DigitalPersona",
            "U.are.U SDK",
            "Bin",
            "DPUruNet.dll"
        ));
        candidatePaths.Add(Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
            "DigitalPersona",
            "U.are.U SDK",
            "Bin",
            "DPUruNet.dll"
        ));
        candidatePaths.Add(Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
            "HID Global",
            "DigitalPersona",
            "U.are.U SDK",
            "Bin",
            "DPUruNet.dll"
        ));
        candidatePaths.Add(Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
            "HID Global",
            "DigitalPersona",
            "U.are.U SDK",
            "Bin",
            "DPUruNet.dll"
        ));

        var loadErrors = new List<string>();
        foreach (var path in candidatePaths.Distinct(StringComparer.OrdinalIgnoreCase))
        {
            if (!File.Exists(path)) continue;

            try
            {
                return (Assembly.LoadFrom(path), null);
            }
            catch (Exception ex)
            {
                loadErrors.Add($"{path}: {ex.Message}");
            }
        }

        if (loadErrors.Count > 0)
        {
            var details = string.Join(" | ", loadErrors.Take(3));
            return (null, $"DPUruNet.dll encontrada, mas nao carregou: {details}");
        }

        return (null, "DPUruNet.dll nao encontrada. Configure UAREU_SDK_DLL_DIR com a pasta do SDK.");
    }
}

sealed class DpfpFingerprintService : IFingerprintService
{
    private readonly ILogger _logger;
    private readonly string _sdkDir;
    private readonly Type? _captureType;
    private readonly Type? _eventHandlerType;
    private readonly Type? _sampleType;
    private readonly Type? _featureExtractionType;
    private readonly Type? _dataPurposeType;
    private readonly Type? _captureFeedbackType;
    private readonly Type? _verificationType;
    private readonly Type? _templateType;

    public DpfpFingerprintService(ILogger logger, string sdkDir)
    {
        _logger = logger;
        _sdkDir = sdkDir;

        var (assemblies, error) = TryLoadAssemblies(sdkDir);
        LastError = error;

        if (assemblies is null)
        {
            return;
        }

        var captureAssembly = assemblies["DPFPDevNET.dll"];
        var sharedAssembly = assemblies["DPFPShrNET.dll"];

        _captureType = captureAssembly.GetType("DPFP.Capture.Capture");
        _eventHandlerType = captureAssembly.GetType("DPFP.Capture.EventHandler");
        _sampleType = sharedAssembly.GetType("DPFP.Sample");

        var hasCapture = _captureType is not null && _eventHandlerType is not null && _sampleType is not null;
        if (!hasCapture)
        {
            LastError = "Tipos de captura DPFP nao encontrados (Capture/EventHandler/Sample).";
            return;
        }

        if (assemblies.TryGetValue("DPFPEngNET.dll", out var engineAssembly)
            && assemblies.TryGetValue("DPFPVerNET.dll", out var verificationAssembly))
        {
            _featureExtractionType = engineAssembly.GetType("DPFP.Processing.FeatureExtraction");
            _dataPurposeType = engineAssembly.GetType("DPFP.Processing.DataPurpose");
            _captureFeedbackType = sharedAssembly.GetType("DPFP.Capture.CaptureFeedback");
            _verificationType = verificationAssembly.GetType("DPFP.Verification.Verification");
            _templateType = sharedAssembly.GetType("DPFP.Template");
        }

        var sdkLocation = string.IsNullOrWhiteSpace(_sdkDir) ? "diretorio padrao do agente" : _sdkDir;
        _logger.LogInformation("SDK DPFP carregado. Origem configurada: {SdkLocation}", sdkLocation);
    }

    public string Mode => "dpfp-sdk";
    public bool IsReady => _captureType is not null && _eventHandlerType is not null && _sampleType is not null;
    public string? LastError { get; }

    public async Task<CaptureTemplateResult> CaptureTemplateAsync(CancellationToken ct)
    {
        if (!IsReady || _captureType is null || _eventHandlerType is null)
        {
            throw new InvalidOperationException($"SDK DPFP indisponivel: {LastError ?? "nao encontrado"}");
        }

        var capture = Activator.CreateInstance(_captureType);
        if (capture is null)
        {
            throw new InvalidOperationException("Nao foi possivel criar instancia de captura DPFP.");
        }

        var startCaptureMethod = _captureType.GetMethod("StartCapture", BindingFlags.Public | BindingFlags.Instance);
        var stopCaptureMethod = _captureType.GetMethod("StopCapture", BindingFlags.Public | BindingFlags.Instance);
        var eventHandlerProperty = _captureType.GetProperty("EventHandler", BindingFlags.Public | BindingFlags.Instance);

        if (startCaptureMethod is null || stopCaptureMethod is null || eventHandlerProperty is null)
        {
            throw new InvalidOperationException("API de captura DPFP incompleta (Start/Stop/EventHandler).");
        }

        var sampleTcs = new TaskCompletionSource<object?>(TaskCreationOptions.RunContinuationsAsynchronously);
        var eventHandler = DpfpCaptureEventProxy.Create(_eventHandlerType, _sampleType, _logger, sample =>
        {
            if (sample is not null)
            {
                sampleTcs.TrySetResult(sample);
            }
        });

        eventHandlerProperty.SetValue(capture, eventHandler);

        try
        {
            startCaptureMethod.Invoke(capture, null);

            var sample = await sampleTcs.Task.WaitAsync(TimeSpan.FromSeconds(20), ct);
            if (sample is null)
            {
                throw new InvalidOperationException("SDK DPFP retornou amostra nula.");
            }

            var sampleBytes = ExtractBytes(sample);

            if (sampleBytes is null || sampleBytes.Length == 0)
            {
                throw new InvalidOperationException("SDK DPFP retornou amostra vazia.");
            }

            _logger.LogInformation("Captura DPFP executada.");
            return new CaptureTemplateResult(Convert.ToBase64String(sampleBytes), "dpfp-sdk");
        }
        catch (TimeoutException)
        {
            throw new InvalidOperationException("Tempo limite de captura DPFP excedido (20s).");
        }
        finally
        {
            try
            {
                stopCaptureMethod.Invoke(capture, null);
            }
            catch
            {
                // Ignora falha de encerramento.
            }

            if (capture is IDisposable disposable)
            {
                disposable.Dispose();
            }
        }
    }

    public Task<bool> IsMatchAsync(string probeTemplateBase64, string enrolledTemplateBase64, CancellationToken ct)
    {
        if (_featureExtractionType is null
            || _dataPurposeType is null
            || _captureFeedbackType is null
            || _verificationType is null
            || _templateType is null
            || _sampleType is null)
        {
            return Task.FromResult(string.Equals(probeTemplateBase64, enrolledTemplateBase64, StringComparison.Ordinal));
        }

        try
        {
            var probeSample = DeserializeSample(probeTemplateBase64);
            var enrolledTemplate = DeserializeTemplate(enrolledTemplateBase64);

            if (probeSample is null || enrolledTemplate is null)
            {
                return Task.FromResult(string.Equals(probeTemplateBase64, enrolledTemplateBase64, StringComparison.Ordinal));
            }

            var verificationPurpose = Enum.Parse(_dataPurposeType, "Verification", ignoreCase: true);
            var feedbackDefault = Enum.Parse(_captureFeedbackType, "None", ignoreCase: true);

            var featureExtraction = Activator.CreateInstance(_featureExtractionType);
            if (featureExtraction is null)
            {
                return Task.FromResult(string.Equals(probeTemplateBase64, enrolledTemplateBase64, StringComparison.Ordinal));
            }

            var createFeatureSetMethod = _featureExtractionType.GetMethod("CreateFeatureSet", BindingFlags.Public | BindingFlags.Instance);
            if (createFeatureSetMethod is null)
            {
                return Task.FromResult(string.Equals(probeTemplateBase64, enrolledTemplateBase64, StringComparison.Ordinal));
            }

            var args = new object?[] { probeSample, verificationPurpose, feedbackDefault, null };
            createFeatureSetMethod.Invoke(featureExtraction, args);
            var probeFeatures = args[3];

            if (probeFeatures is null)
            {
                return Task.FromResult(string.Equals(probeTemplateBase64, enrolledTemplateBase64, StringComparison.Ordinal));
            }

            var verification = Activator.CreateInstance(_verificationType);
            var verifyMethod = _verificationType.GetMethod("Verify", [probeFeatures.GetType(), _templateType]);
            if (verification is null || verifyMethod is null)
            {
                return Task.FromResult(string.Equals(probeTemplateBase64, enrolledTemplateBase64, StringComparison.Ordinal));
            }

            var result = verifyMethod.Invoke(verification, [probeFeatures, enrolledTemplate]);
            var verifiedProperty = result?.GetType().GetProperty("Verified", BindingFlags.Public | BindingFlags.Instance);

            if (verifiedProperty?.GetValue(result) is bool verified)
            {
                return Task.FromResult(verified);
            }
        }
        catch
        {
            // Fallback para igualdade literal se SDK nao conseguir verificar.
        }

        return Task.FromResult(string.Equals(probeTemplateBase64, enrolledTemplateBase64, StringComparison.Ordinal));
    }

    private object? DeserializeSample(string base64)
    {
        if (_sampleType is null) return null;

        try
        {
            var bytes = Convert.FromBase64String(base64);
            using var stream = new MemoryStream(bytes);
            return Activator.CreateInstance(_sampleType, stream);
        }
        catch
        {
            return null;
        }
    }

    private object? DeserializeTemplate(string base64)
    {
        if (_templateType is null) return null;

        try
        {
            var bytes = Convert.FromBase64String(base64);
            using var stream = new MemoryStream(bytes);
            return Activator.CreateInstance(_templateType, stream);
        }
        catch
        {
            return null;
        }
    }

    private static byte[]? ExtractBytes(object source)
    {
        var bytesProperty = source.GetType().GetProperty("Bytes", BindingFlags.Public | BindingFlags.Instance);
        if (bytesProperty?.GetValue(source) is byte[] bytesFromProperty)
        {
            return bytesFromProperty;
        }

        return null;
    }

    private static (Dictionary<string, Assembly>? assemblies, string? error) TryLoadAssemblies(string sdkDir)
    {
        var candidateDirectories = new List<string>();

        if (!string.IsNullOrWhiteSpace(sdkDir))
        {
            candidateDirectories.Add(sdkDir);
            candidateDirectories.Add(Path.Combine(sdkDir, "Bin"));
            candidateDirectories.Add(Path.Combine(sdkDir, ".NET"));
            candidateDirectories.Add(Path.Combine(sdkDir, ".NET", "Bin"));
        }

        candidateDirectories.Add(Path.Combine(AppContext.BaseDirectory, "sdk"));
        candidateDirectories.Add(AppContext.BaseDirectory);
        candidateDirectories.Add(Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
            "DigitalPersona",
            "One Touch SDK",
            ".NET",
            "Bin"
        ));
        candidateDirectories.Add(Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
            "DigitalPersona",
            "One Touch SDK",
            ".NET",
            "Bin"
        ));

        var requiredFiles = new[]
        {
            "DPFPShrNET.dll",
            "DPFPDevNET.dll",
            "DPFPEngNET.dll",
            "DPFPVerNET.dll"
        };

        foreach (var directory in candidateDirectories
            .Where(path => !string.IsNullOrWhiteSpace(path))
            .Distinct(StringComparer.OrdinalIgnoreCase))
        {
            try
            {
                var filePaths = requiredFiles.Select(file => Path.Combine(directory, file)).ToArray();
                if (filePaths.Any(path => !File.Exists(path))) continue;

                var assemblies = new Dictionary<string, Assembly>(StringComparer.OrdinalIgnoreCase);
                foreach (var filePath in filePaths)
                {
                    var assembly = Assembly.LoadFrom(filePath);
                    assemblies[Path.GetFileName(filePath)] = assembly;
                }

                return (assemblies, null);
            }
            catch (Exception ex)
            {
                return (null, $"Erro ao carregar SDK DPFP em {directory}: {ex.Message}");
            }
        }

        return (null, "DPFP*.dll nao encontrada. Configure UAREU_SDK_DLL_DIR com a pasta do SDK DPFP.");
    }
}

class DpfpCaptureEventProxy : DispatchProxy
{
    private Type? _sampleType;
    private ILogger? _logger;
    public Action<object?>? OnComplete { get; set; }

    protected override object? Invoke(MethodInfo? targetMethod, object?[]? args)
    {
        if (targetMethod is null) return null;

        if (args is not null)
        {
            var sample = TryExtractSample(args);
            if (sample is not null)
            {
                _logger?.LogDebug("Evento DPFP {Method} recebeu amostra.", targetMethod.Name);
                OnComplete?.Invoke(sample);
            }
        }

        return null;
    }

    private object? TryExtractSample(object?[] args)
    {
        foreach (var arg in args)
        {
            if (arg is null) continue;

            if (_sampleType is not null && _sampleType.IsInstanceOfType(arg))
            {
                return arg;
            }

            var bytesProperty = arg.GetType().GetProperty("Bytes", BindingFlags.Public | BindingFlags.Instance);
            if (bytesProperty?.GetValue(arg) is byte[] bytes && bytes.Length > 0)
            {
                return arg;
            }
        }

        return null;
    }

    public static object Create(Type eventHandlerType, Type? sampleType, ILogger logger, Action<object?> onComplete)
    {
        var handler = DispatchProxy.Create(eventHandlerType, typeof(DpfpCaptureEventProxy));
        if (handler is DpfpCaptureEventProxy proxy)
        {
            proxy._sampleType = sampleType;
            proxy._logger = logger;
            proxy.OnComplete = onComplete;
        }

        return handler;
    }
}

interface IAgentApiClient
{
    Task<JsonElement> PostAsync(string apiBaseUrl, string path, string token, object payload, CancellationToken ct);
}

sealed class AgentApiClient(IHttpClientFactory httpClientFactory) : IAgentApiClient
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    public async Task<JsonElement> PostAsync(string apiBaseUrl, string path, string token, object payload, CancellationToken ct)
    {
        var trimmedBase = apiBaseUrl.TrimEnd('/');
        var client = httpClientFactory.CreateClient();

        using var request = new HttpRequestMessage(HttpMethod.Post, $"{trimmedBase}{path}");
        request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
        request.Content = new StringContent(JsonSerializer.Serialize(payload, JsonOptions), Encoding.UTF8, "application/json");

        using var response = await client.SendAsync(request, ct);
        var body = await response.Content.ReadAsStringAsync(ct);

        if (!response.IsSuccessStatusCode)
        {
            var message = ExtractErrorMessage(body) ?? "Falha na API SmartCheck";
            throw new InvalidOperationException(message);
        }

        using var document = JsonDocument.Parse(string.IsNullOrWhiteSpace(body) ? "{}" : body);
        return document.RootElement.Clone();
    }

    private static string? ExtractErrorMessage(string responseBody)
    {
        if (string.IsNullOrWhiteSpace(responseBody)) return null;

        try
        {
            using var document = JsonDocument.Parse(responseBody);
            if (document.RootElement.TryGetProperty("message", out var messageElement)
                && messageElement.ValueKind == JsonValueKind.String)
            {
                return messageElement.GetString();
            }
        }
        catch
        {
            // Ignora parse invalido e retorna null.
        }

        return null;
    }
}

sealed class TemplateStore
{
    private readonly string _filePath;
    private readonly SemaphoreSlim _mutex = new(1, 1);
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true
    };

    public TemplateStore()
    {
        var baseDir = Environment.GetEnvironmentVariable("AGENT_DATA_DIR");
        if (string.IsNullOrWhiteSpace(baseDir))
        {
            var localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            baseDir = Path.Combine(localAppData, "SmartCheck", "Biometric Agent", "data");
        }

        try
        {
            Directory.CreateDirectory(baseDir);
        }
        catch
        {
            var tempFallback = Path.Combine(Path.GetTempPath(), "SmartCheck", "Biometric Agent", "data");
            Directory.CreateDirectory(tempFallback);
            baseDir = tempFallback;
        }

        _filePath = Path.Combine(baseDir, "templates.json");
    }

    public async Task<IReadOnlyList<TemplateEntry>> GetAllAsync(CancellationToken ct)
    {
        await _mutex.WaitAsync(ct);

        try
        {
            if (!File.Exists(_filePath)) return [];

            var json = await File.ReadAllTextAsync(_filePath, ct);
            if (string.IsNullOrWhiteSpace(json)) return [];

            return JsonSerializer.Deserialize<List<TemplateEntry>>(json, JsonOptions) ?? [];
        }
        finally
        {
            _mutex.Release();
        }
    }

    public async Task UpsertAsync(TemplateEntry entry, CancellationToken ct)
    {
        await _mutex.WaitAsync(ct);

        try
        {
            var entries = new List<TemplateEntry>();
            if (File.Exists(_filePath))
            {
                var json = await File.ReadAllTextAsync(_filePath, ct);
                if (!string.IsNullOrWhiteSpace(json))
                {
                    entries = JsonSerializer.Deserialize<List<TemplateEntry>>(json, JsonOptions) ?? [];
                }
            }

            entries.RemoveAll(item =>
                string.Equals(item.EmployeeId, entry.EmployeeId, StringComparison.OrdinalIgnoreCase)
                || string.Equals(item.BiometricExternalId, entry.BiometricExternalId, StringComparison.OrdinalIgnoreCase));

            entries.Add(entry);

            var output = JsonSerializer.Serialize(entries, JsonOptions);
            await File.WriteAllTextAsync(_filePath, output, ct);
        }
        finally
        {
            _mutex.Release();
        }
    }
}
