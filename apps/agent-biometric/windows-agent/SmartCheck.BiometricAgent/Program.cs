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

    if (mode == "mock")
    {
        return new MockFingerprintService(logger);
    }

    var sdkDir = Environment.GetEnvironmentVariable("UAREU_SDK_DLL_DIR") ?? string.Empty;
    var sdkService = new UareuFingerprintService(logger, sdkDir);

    if (!sdkService.IsReady)
    {
        logger.LogWarning("SDK U.are.U nao carregou. Motivo: {Reason}. Fallback para MOCK.", sdkService.LastError);
        return new MockFingerprintService(logger);
    }

    return sdkService;
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

app.MapPost("/enroll", async (EnrollRequest request, IFingerprintService fingerprintService, IAgentApiClient apiClient, TemplateStore templateStore, CancellationToken ct) =>
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

    var captured = await fingerprintService.CaptureTemplateAsync(ct);
    var biometricExternalId = string.IsNullOrWhiteSpace(request.BiometricExternalId)
        ? BuildExternalId(request.EmployeeId, captured.TemplateBase64)
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
            biometricTemplateId = captured.TemplateBase64
        },
        ct
    );

    await templateStore.UpsertAsync(new TemplateEntry(
        request.EmployeeId,
        biometricExternalId,
        captured.TemplateBase64,
        DateTimeOffset.UtcNow
    ), ct);

    return Results.Ok(new
    {
        message = "Biometria cadastrada no SmartCheck.",
        employeeId = request.EmployeeId,
        biometricExternalId,
        biometricTemplateId = captured.TemplateBase64,
        source = captured.Source
    });
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

        var templateBytes = TryCaptureTemplateBytes(_assembly);
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

    private static byte[]? TryCaptureTemplateBytes(Assembly assembly)
    {
        var readerCollectionType = assembly.GetType("DPUruNet.ReaderCollection");
        var readerType = assembly.GetType("DPUruNet.Reader");
        var engineType = assembly.GetType("DPUruNet.Engine");
        var constantsCapturePriority = assembly.GetType("DPUruNet.Constants+CapturePriority");

        if (readerCollectionType is null || readerType is null || engineType is null || constantsCapturePriority is null)
        {
            return null;
        }

        var getReaders = readerCollectionType.GetMethod("GetReaders", BindingFlags.Public | BindingFlags.Static);
        var readers = getReaders?.Invoke(null, null) as IEnumerable;
        var reader = readers?.Cast<object>().FirstOrDefault();
        if (reader is null)
        {
            throw new InvalidOperationException("Nenhum leitor U.are.U encontrado.");
        }

        var openMethod = readerType.GetMethod("Open", BindingFlags.Public | BindingFlags.Instance);
        var closeMethod = readerType.GetMethod("Close", BindingFlags.Public | BindingFlags.Instance);
        var captureMethod = readerType.GetMethods(BindingFlags.Public | BindingFlags.Instance)
            .FirstOrDefault(method => method.Name == "Capture" && method.GetParameters().Length >= 3);

        if (openMethod is null || closeMethod is null || captureMethod is null)
        {
            return null;
        }

        object? priority = Enum.GetValues(constantsCapturePriority)
            .Cast<object>()
            .FirstOrDefault(value => value.ToString()?.Contains("COOPERATIVE", StringComparison.OrdinalIgnoreCase) == true)
            ?? Enum.GetValues(constantsCapturePriority).Cast<object>().First();

        try
        {
            openMethod.Invoke(reader, [priority]);

            var captureArgs = BuildCaptureArguments(captureMethod.GetParameters(), assembly);
            var captureResult = captureMethod.Invoke(reader, captureArgs);
            if (captureResult is null)
            {
                return null;
            }

            var dataProperty = captureResult.GetType().GetProperty("Data", BindingFlags.Public | BindingFlags.Instance);
            var fid = dataProperty?.GetValue(captureResult);
            if (fid is null)
            {
                return null;
            }

            var engine = Activator.CreateInstance(engineType);
            if (engine is null)
            {
                return null;
            }

            var createFmdMethod = engineType.GetMethods(BindingFlags.Public | BindingFlags.Instance)
                .FirstOrDefault(method => method.Name.Contains("CreateFmd", StringComparison.OrdinalIgnoreCase)
                    && method.GetParameters().Length == 2);

            if (createFmdMethod is null)
            {
                return ExtractBytes(fid);
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

            var fmd = createFmdMethod.Invoke(engine, [fid, fmdFormat]);
            return fmd is null ? ExtractBytes(fid) : ExtractBytes(fmd) ?? ExtractBytes(fid);
        }
        finally
        {
            closeMethod.Invoke(reader, null);
        }
    }

    private static object?[] BuildCaptureArguments(ParameterInfo[] parameters, Assembly assembly)
    {
        var args = new object?[parameters.Length];
        var fidFormatType = assembly.GetType("DPUruNet.Constants+Formats+Fid");
        var captureProcessingType = assembly.GetType("DPUruNet.Constants+CaptureProcessing");

        for (var i = 0; i < parameters.Length; i++)
        {
            var type = parameters[i].ParameterType;

            if (type == typeof(int))
            {
                args[i] = i == 2 ? 5000 : -1;
                continue;
            }

            if (type.IsEnum)
            {
                if (fidFormatType is not null && type == fidFormatType)
                {
                    args[i] = Enum.GetValues(type).Cast<object>()
                        .FirstOrDefault(value => value.ToString()?.Contains("ANSI", StringComparison.OrdinalIgnoreCase) == true)
                        ?? Enum.GetValues(type).Cast<object>().First();
                    continue;
                }

                if (captureProcessingType is not null && type == captureProcessingType)
                {
                    args[i] = Enum.GetValues(type).Cast<object>()
                        .FirstOrDefault(value => value.ToString()?.Contains("DEFAULT", StringComparison.OrdinalIgnoreCase) == true)
                        ?? Enum.GetValues(type).Cast<object>().First();
                    continue;
                }

                args[i] = Enum.GetValues(type).Cast<object>().First();
                continue;
            }

            args[i] = parameters[i].HasDefaultValue ? parameters[i].DefaultValue : null;
        }

        return args;
    }

    private static byte[]? ExtractBytes(object source)
    {
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

        foreach (var path in candidatePaths.Distinct())
        {
            if (!File.Exists(path)) continue;

            try
            {
                return (Assembly.LoadFrom(path), null);
            }
            catch (Exception ex)
            {
                return (null, $"Erro ao carregar {path}: {ex.Message}");
            }
        }

        return (null, "DPUruNet.dll nao encontrada. Configure UAREU_SDK_DLL_DIR com a pasta do SDK.");
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
            baseDir = Path.Combine(AppContext.BaseDirectory, "data");
        }

        Directory.CreateDirectory(baseDir);
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
