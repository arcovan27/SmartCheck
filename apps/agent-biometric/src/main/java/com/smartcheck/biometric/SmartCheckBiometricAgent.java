package com.smartcheck.biometric;

import com.digitalpersona.uareu.Engine;
import com.digitalpersona.uareu.Fid;
import com.digitalpersona.uareu.Fmd;
import com.digitalpersona.uareu.Importer;
import com.digitalpersona.uareu.Reader;
import com.digitalpersona.uareu.ReaderCollection;
import com.digitalpersona.uareu.UareUException;
import com.digitalpersona.uareu.UareUGlobal;
import com.sun.net.httpserver.Headers;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.InetSocketAddress;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class SmartCheckBiometricAgent {
    private static final String AGENT_BUILD = "2026-03-24-capture-v2";
    private static final String HOST = "127.0.0.1";
    private static final int PORT = 4100;
    private static final int IDENTIFY_THRESHOLD = Engine.PROBABILITY_ONE / 100000;
    private static final int CAPTURE_TIMEOUT_MS = 15000;
    private static final int STREAM_FALLBACK_TIMEOUT_MS = 15000;
    private static final Path STORE_PATH = Paths.get(
        System.getenv("PROGRAMDATA") != null ? System.getenv("PROGRAMDATA") : "C:\\ProgramData",
        "SmartCheck",
        "biometric-store.json"
    );
    private static final Path LOG_PATH = Paths.get(
        System.getenv("PROGRAMDATA") != null ? System.getenv("PROGRAMDATA") : "C:\\ProgramData",
        "SmartCheck",
        "biometric-agent.log"
    );
    private static final DateTimeFormatter LOG_TIME_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss.SSS");

    public static void main(String[] args) throws Exception {
        ensureStoreDir();
        ensureLogFile();

        HttpServer server = HttpServer.create(new InetSocketAddress(HOST, PORT), 0);
        server.createContext("/health", new HealthHandler());
        server.createContext("/enroll", new EnrollHandler());
        server.createContext("/identify", new IdentifyHandler());
        server.setExecutor(Executors.newCachedThreadPool());
        server.start();

        System.out.println("SmartCheck Biometric Agent " + AGENT_BUILD + " listening on http://" + HOST + ":" + PORT);
        logInfo("Agent started (" + AGENT_BUILD + ") at http://" + HOST + ":" + PORT);
    }

    private static void ensureStoreDir() throws IOException {
        Files.createDirectories(STORE_PATH.getParent());
        if (!Files.exists(STORE_PATH)) {
            Files.write(STORE_PATH, "[]".getBytes(StandardCharsets.UTF_8));
        }
    }

    private static void ensureLogFile() throws IOException {
        Files.createDirectories(LOG_PATH.getParent());
        if (!Files.exists(LOG_PATH)) {
            Files.write(LOG_PATH, new byte[0]);
        }
    }

    private static final class HealthHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            logInfo("HTTP " + exchange.getRequestMethod() + " /health");
            if (handleCors(exchange)) {
                return;
            }
            if (!"GET".equalsIgnoreCase(exchange.getRequestMethod())) {
                sendJson(exchange, 405, "{\"message\":\"Metodo nao permitido\"}");
                return;
            }

            List<Map<String, String>> readers = new ArrayList<Map<String, String>>();
            try {
                ReaderCollection collection = UareUGlobal.GetReaderCollection();
                collection.GetReaders();
                for (Reader reader : collection) {
                    Map<String, String> item = new LinkedHashMap<String, String>();
                    item.put("name", safe(reader.GetDescription().name));
                    item.put("serialNumber", safe(reader.GetDescription().serial_number));
                    readers.add(item);
                }
            } catch (Exception e) {
                sendJson(exchange, 200, "{\"status\":\"warning\",\"message\":" + quote(e.getMessage()) + "}");
                return;
            }

            StringBuilder json = new StringBuilder();
            json.append("{\"status\":\"ok\",\"readers\":[");
            for (int i = 0; i < readers.size(); i++) {
                if (i > 0) {
                    json.append(",");
                }
                Map<String, String> reader = readers.get(i);
                json.append("{\"name\":").append(quote(reader.get("name")))
                    .append(",\"serialNumber\":").append(quote(reader.get("serialNumber")))
                    .append("}");
            }
            json.append("]}");
            sendJson(exchange, 200, json.toString());
        }
    }

    private static final class EnrollHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            logInfo("HTTP " + exchange.getRequestMethod() + " /enroll");
            if (handleCors(exchange)) {
                return;
            }
            if (!"POST".equalsIgnoreCase(exchange.getRequestMethod())) {
                sendJson(exchange, 405, "{\"message\":\"Metodo nao permitido\"}");
                return;
            }
            if (!FingerprintService.tryAcquireCaptureSlot()) {
                logInfo("Capture slot busy for /enroll");
                sendJson(exchange, 409, "{\"message\":\"Leitor biometrico em uso. Aguarde a operacao atual terminar.\"}");
                return;
            }

            try {
                RequestData request = RequestData.fromJson(readBody(exchange));
                require(request.employeeId, "employeeId");
                require(request.apiBaseUrl, "apiBaseUrl");
                require(request.token, "token");
                logInfo("Enroll request accepted for employeeId=" + request.employeeId);

                ApiClient apiClient = new ApiClient(request.apiBaseUrl, request.token);
                apiClient.post("/biometric/enroll/start",
                    "{\"employeeId\":" + quote(request.employeeId) + ",\"provider\":\"UAREU_4500\"}");

                CapturedTemplate captured = FingerprintService.captureForEnrollment();
                String biometricExternalId = UUID.randomUUID().toString();

                TemplateStore store = TemplateStore.load();
                store.upsert(new TemplateRecord(
                    request.employeeId,
                    biometricExternalId,
                    captured.base64Fmd,
                    safe(captured.readerName),
                    String.valueOf(System.currentTimeMillis())
                ));
                store.save();

                String responseBody = apiClient.post("/biometric/enroll/finish",
                    "{\"employeeId\":" + quote(request.employeeId)
                        + ",\"provider\":\"UAREU_4500\""
                        + ",\"biometricExternalId\":" + quote(biometricExternalId)
                        + "}");

                sendJson(exchange, 201,
                    "{\"message\":\"Biometria cadastrada com sucesso\",\"biometricExternalId\":"
                        + quote(biometricExternalId)
                        + ",\"apiResponse\":"
                        + responseBody
                        + "}");
                logInfo("Enroll success employeeId=" + request.employeeId + " externalId=" + biometricExternalId);
            } catch (ApiException e) {
                logError("Enroll API error: " + normalizeMessage(e));
                sendJson(exchange, e.statusCode, "{\"message\":" + quote(e.getMessage()) + "}");
            } catch (Exception e) {
                logError("Enroll failed: " + normalizeMessage(e));
                sendJson(exchange, 500, "{\"message\":" + quote(normalizeMessage(e)) + "}");
            } finally {
                FingerprintService.releaseCaptureSlot();
                logInfo("Capture slot released for /enroll");
            }
        }
    }

    private static final class IdentifyHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            logInfo("HTTP " + exchange.getRequestMethod() + " /identify");
            if (handleCors(exchange)) {
                return;
            }
            if (!"POST".equalsIgnoreCase(exchange.getRequestMethod())) {
                sendJson(exchange, 405, "{\"message\":\"Metodo nao permitido\"}");
                return;
            }
            if (!FingerprintService.tryAcquireCaptureSlot()) {
                logInfo("Capture slot busy for /identify");
                sendJson(exchange, 409, "{\"message\":\"Leitor biometrico em uso. Aguarde a operacao atual terminar.\"}");
                return;
            }

            try {
                RequestData request = RequestData.fromJson(readBody(exchange));
                require(request.apiBaseUrl, "apiBaseUrl");
                require(request.token, "token");
                logInfo("Identify request accepted");

                TemplateStore store = TemplateStore.load();
                if (store.records.isEmpty()) {
                    throw new IllegalStateException("Nenhuma biometria foi cadastrada neste computador.");
                }

                MatchResult match = FingerprintService.identify(store.records);
                if (request.employeeId != null && request.employeeId.length() > 0
                    && !request.employeeId.equals(match.record.employeeId)) {
                    throw new IllegalStateException("A digital lida pertence a outro funcionario cadastrado neste computador.");
                }

                ApiClient apiClient = new ApiClient(request.apiBaseUrl, request.token);
                String apiResponse = apiClient.post("/biometric/identify",
                    "{\"biometricExternalId\":" + quote(match.record.biometricExternalId) + "}");

                sendJson(exchange, 200,
                    "{\"message\":\"Biometria identificada com sucesso\","
                        + "\"employeeId\":" + quote(match.record.employeeId) + ","
                        + "\"biometricExternalId\":" + quote(match.record.biometricExternalId) + ","
                        + "\"score\":" + match.score + ","
                        + "\"apiResponse\":" + apiResponse
                        + "}");
                logInfo("Identify success employeeId=" + match.record.employeeId + " score=" + match.score);
            } catch (ApiException e) {
                logError("Identify API error: " + normalizeMessage(e));
                sendJson(exchange, e.statusCode, "{\"message\":" + quote(e.getMessage()) + "}");
            } catch (Exception e) {
                logError("Identify failed: " + normalizeMessage(e));
                sendJson(exchange, 500, "{\"message\":" + quote(normalizeMessage(e)) + "}");
            } finally {
                FingerprintService.releaseCaptureSlot();
                logInfo("Capture slot released for /identify");
            }
        }
    }

    private static final class FingerprintService {
        private static final Object CAPTURE_SLOT_MONITOR = new Object();
        private static boolean captureInProgress = false;

        static boolean tryAcquireCaptureSlot() {
            synchronized (CAPTURE_SLOT_MONITOR) {
                if (captureInProgress) {
                    return false;
                }
                captureInProgress = true;
                return true;
            }
        }

        static void releaseCaptureSlot() {
            synchronized (CAPTURE_SLOT_MONITOR) {
                captureInProgress = false;
            }
        }

        static CapturedTemplate captureForEnrollment() throws Exception {
            return captureOnce("Posicione o mesmo dedo no leitor para cadastrar a biometria.");
        }

        static MatchResult identify(List<TemplateRecord> records) throws Exception {
            CapturedTemplate captured = captureOnce("Posicione o dedo no leitor para identificar.");
            Importer importer = UareUGlobal.GetImporter();
            Engine engine = UareUGlobal.GetEngine();
            Fmd probe = importer.ImportFmd(
                Base64.getDecoder().decode(captured.base64Fmd),
                Fmd.Format.ANSI_378_2004,
                Fmd.Format.ANSI_378_2004
            );

            TemplateRecord bestRecord = null;
            int bestScore = Integer.MAX_VALUE;

            for (TemplateRecord record : records) {
                Fmd candidate = importer.ImportFmd(
                    Base64.getDecoder().decode(record.base64Fmd),
                    Fmd.Format.ANSI_378_2004,
                    Fmd.Format.ANSI_378_2004
                );
                int score = engine.Compare(probe, 0, candidate, 0);
                if (score < bestScore) {
                    bestScore = score;
                    bestRecord = record;
                }
            }

            if (bestRecord == null || bestScore > IDENTIFY_THRESHOLD) {
                throw new IllegalStateException("Biometria nao reconhecida.");
            }

            return new MatchResult(bestRecord, bestScore);
        }

        private static CapturedTemplate captureOnce(String prompt) throws Exception {
            System.out.println(prompt);
            logInfo(prompt);
            ReaderCollection collection = UareUGlobal.GetReaderCollection();
            collection.GetReaders();
            if (collection.isEmpty()) {
                throw new IllegalStateException("Nenhum leitor DigitalPersona encontrado.");
            }

            List<String> errors = new ArrayList<String>();
            for (int i = 0; i < collection.size(); i++) {
                Reader reader = collection.get(i);
                String readerName = safe(reader.GetDescription().name);
                String serialNumber = safe(reader.GetDescription().serial_number);
                System.out.println(
                    "Tentando leitor " + (i + 1) + "/" + collection.size() + ": "
                        + readerName + " [" + serialNumber + "]"
                );
                logInfo("Trying reader " + (i + 1) + "/" + collection.size() + " name=" + readerName + " serial=" + serialNumber);

                try {
                    Reader.Priority openedPriority = openReaderWithPriorityFallback(reader, readerName);
                    logInfo("Reader opened: " + readerName + " priority=" + openedPriority);

                    Reader.Status status = reader.GetStatus();
                    System.out.println("Status do leitor: " + status.status);
                    logInfo("Reader status: " + status.status + " reader=" + readerName);
                    Reader.Capabilities capabilities = reader.GetCapabilities();
                    if (capabilities != null) {
                        logInfo("Reader capabilities: can_capture=" + capabilities.can_capture
                            + ", can_stream=" + capabilities.can_stream
                            + ", can_extract_features=" + capabilities.can_extract_features);
                    }

                    if (!reader.GetCapabilities().can_capture) {
                        errors.add("Leitor " + readerName + " nao suporta captura.");
                        continue;
                    }

                    Reader.CaptureResult result = captureWithTimeout(reader);
                    boolean canStream = reader.GetCapabilities() != null && reader.GetCapabilities().can_stream;
                    if (result == null || result.image == null || result.quality != Reader.CaptureQuality.GOOD) {
                        logInfo("Capture direct result not good. quality="
                            + (result == null ? "null" : String.valueOf(result.quality))
                            + ", hasImage=" + (result != null && result.image != null)
                            + ", canStream=" + canStream);
                    }
                    if ((result == null || result.image == null || result.quality != Reader.CaptureQuality.GOOD)
                        && canStream) {
                        logInfo("Trying streaming fallback");
                        Reader.CaptureResult streamResult = captureByStreaming(reader);
                        if (streamResult != null) {
                            result = streamResult;
                        }
                    }

                    if (result == null || result.image == null) {
                        if (result != null && result.quality == Reader.CaptureQuality.CANCELED) {
                            errors.add("Leitor " + readerName + " expirou sem captura em " + (CAPTURE_TIMEOUT_MS / 1000) + "s.");
                            logInfo("Capture timeout/canceled for reader=" + readerName);
                        } else {
                            errors.add("Leitor " + readerName + " nao retornou imagem.");
                            logInfo("Capture returned no image for reader=" + readerName);
                        }
                        continue;
                    }

                    if (result.quality != Reader.CaptureQuality.GOOD) {
                        errors.add("Leitor " + readerName + " retornou qualidade " + result.quality + ".");
                        logInfo("Capture quality not good: " + result.quality + " reader=" + readerName);
                        continue;
                    }

                    Fmd fmd = UareUGlobal.GetEngine().CreateFmd(result.image, Fmd.Format.ANSI_378_2004);
                    System.out.println("Captura realizada com sucesso no leitor " + readerName + ".");
                    logInfo("Capture success on reader=" + readerName + " fmdBytes=" + fmd.getData().length);
                    return new CapturedTemplate(
                        Base64.getEncoder().encodeToString(fmd.getData()),
                        readerName
                    );
                } catch (Exception e) {
                    errors.add("Leitor " + readerName + " falhou: " + normalizeMessage(e));
                    logError("Reader failed " + readerName + ": " + normalizeMessage(e));
                } finally {
                    try {
                        reader.Close();
                        logInfo("Reader closed: " + readerName);
                    } catch (UareUException ignored) {
                    }
                }
            }

            StringBuilder message = new StringBuilder();
            message.append("Nenhum leitor conseguiu capturar a digital em ")
                .append(CAPTURE_TIMEOUT_MS / 1000)
                .append("s.");
            if (!errors.isEmpty()) {
                message.append(" Detalhes: ");
                for (int i = 0; i < errors.size(); i++) {
                    if (i > 0) {
                        message.append(" | ");
                    }
                    message.append(errors.get(i));
                }
            }
            logError("No reader captured fingerprint. " + message.toString());
            throw new IllegalStateException(message.toString());
        }

        private static Reader.CaptureResult captureWithTimeout(final Reader reader) throws Exception {
            SampleCaptureThread captureThread = new SampleCaptureThread(
                reader,
                Fid.Format.ANSI_381_2004,
                Reader.ImageProcessing.IMG_PROC_DEFAULT
            );
            logInfo("Starting capture thread");
            captureThread.start();
            captureThread.join(CAPTURE_TIMEOUT_MS);
            logInfo("Capture thread join finished. alive=" + captureThread.isAlive());

            if (captureThread.isAlive()) {
                captureThread.cancel();
                captureThread.join(2000);
                logInfo("Capture thread canceled after timeout");
            }

            SampleCaptureThread.CaptureOutcome outcome = captureThread.getOutcome();
            if (outcome == null) {
                Reader.CaptureResult canceled = new Reader.CaptureResult();
                canceled.quality = Reader.CaptureQuality.CANCELED;
                return canceled;
            }

            if (outcome.exception != null) {
                logError("Capture outcome exception: " + normalizeMessage((Exception) outcome.exception));
                throw outcome.exception;
            }

            if (outcome.readerStatus != null
                && outcome.readerStatus.status != Reader.ReaderStatus.READY
                && outcome.readerStatus.status != Reader.ReaderStatus.NEED_CALIBRATION) {
                throw new IllegalStateException("Leitor em estado invalido: " + outcome.readerStatus.status);
            }

            if (outcome.captureResult == null) {
                Reader.CaptureResult canceled = new Reader.CaptureResult();
                canceled.quality = Reader.CaptureQuality.CANCELED;
                return canceled;
            }
            logInfo("Capture outcome quality=" + outcome.captureResult.quality);

            return outcome.captureResult;
        }

        private static Reader.Priority openReaderWithPriorityFallback(Reader reader, String readerName) throws Exception {
            try {
                reader.Open(Reader.Priority.EXCLUSIVE);
                logInfo("Reader open with EXCLUSIVE succeeded: " + readerName);
                return Reader.Priority.EXCLUSIVE;
            } catch (Exception firstError) {
                logInfo("Reader open with EXCLUSIVE failed: " + normalizeMessage((Exception) firstError));
            }

            reader.Open(Reader.Priority.COOPERATIVE);
            logInfo("Reader open with COOPERATIVE succeeded: " + readerName);
            return Reader.Priority.COOPERATIVE;
        }

        private static Reader.CaptureResult captureByStreaming(Reader reader) throws Exception {
            long start = System.currentTimeMillis();
            try {
                reader.StartStreaming();
                logInfo("Streaming started");
                while ((System.currentTimeMillis() - start) < STREAM_FALLBACK_TIMEOUT_MS) {
                    Reader.CaptureResult result = reader.GetStreamImage(
                        Fid.Format.ANSI_381_2004,
                        Reader.ImageProcessing.IMG_PROC_DEFAULT,
                        reader.GetCapabilities().resolutions[0]
                    );
                    if (result != null) {
                        logInfo("Streaming frame quality=" + result.quality);
                        if (result.image != null && result.quality == Reader.CaptureQuality.GOOD) {
                            logInfo("Streaming capture got GOOD image");
                            return result;
                        }
                    }
                    Thread.sleep(80);
                }

                Reader.CaptureResult canceled = new Reader.CaptureResult();
                canceled.quality = Reader.CaptureQuality.CANCELED;
                logInfo("Streaming fallback timeout after " + STREAM_FALLBACK_TIMEOUT_MS + "ms");
                return canceled;
            } finally {
                try {
                    reader.StopStreaming();
                    logInfo("Streaming stopped");
                } catch (Exception stopError) {
                    logError("Failed to stop streaming: " + normalizeMessage((Exception) stopError));
                }
            }
        }
    }

    // Copia do comportamento central do sample CaptureThread.java, adaptado para uso headless no agente.
    private static final class SampleCaptureThread extends Thread {
        private final Reader reader;
        private final Fid.Format format;
        private final Reader.ImageProcessing processing;
        private volatile boolean canceled;
        private volatile CaptureOutcome outcome;

        private SampleCaptureThread(Reader reader, Fid.Format format, Reader.ImageProcessing processing) {
            super("smartcheck-sample-capture-thread");
            this.reader = reader;
            this.format = format;
            this.processing = processing;
            this.canceled = false;
        }

        @Override
        public void run() {
            try {
                boolean ready = false;
                while (!ready && !canceled) {
                    Reader.Status status = reader.GetStatus();
                    if (Reader.ReaderStatus.BUSY == status.status) {
                        try {
                            Thread.sleep(100);
                        } catch (InterruptedException interruptedException) {
                            break;
                        }
                    } else if (Reader.ReaderStatus.READY == status.status
                        || Reader.ReaderStatus.NEED_CALIBRATION == status.status) {
                        ready = true;
                    } else {
                        outcome = new CaptureOutcome(null, status, null);
                        return;
                    }
                }

                if (canceled) {
                    Reader.CaptureResult canceledResult = new Reader.CaptureResult();
                    canceledResult.quality = Reader.CaptureQuality.CANCELED;
                    outcome = new CaptureOutcome(canceledResult, null, null);
                    return;
                }

                if (ready) {
                    logInfo("Calling blocking reader.Capture()");
                    Reader.CaptureResult captureResult = reader.Capture(
                        format,
                        processing,
                        reader.GetCapabilities().resolutions[0],
                        -1
                    );
                    logInfo("reader.Capture() returned quality="
                        + (captureResult == null ? "null" : String.valueOf(captureResult.quality))
                        + ", hasImage=" + (captureResult != null && captureResult.image != null));
                    outcome = new CaptureOutcome(captureResult, null, null);
                }
            } catch (UareUException exception) {
                outcome = new CaptureOutcome(null, null, exception);
            }
        }

        private void cancel() {
            canceled = true;
            try {
                reader.CancelCapture();
            } catch (Exception ignored) {
            }
        }

        private CaptureOutcome getOutcome() {
            return outcome;
        }

        private static final class CaptureOutcome {
            private final Reader.CaptureResult captureResult;
            private final Reader.Status readerStatus;
            private final Exception exception;

            private CaptureOutcome(Reader.CaptureResult captureResult, Reader.Status readerStatus, Exception exception) {
                this.captureResult = captureResult;
                this.readerStatus = readerStatus;
                this.exception = exception;
            }
        }
    }

    private static final class ApiClient {
        private final String baseUrl;
        private final String token;

        ApiClient(String baseUrl, String token) {
            this.baseUrl = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
            this.token = token;
        }

        String post(String path, String jsonBody) throws IOException, ApiException {
            logInfo("Calling API POST " + baseUrl + path);
            HttpURLConnection connection = (HttpURLConnection) new URL(baseUrl + path).openConnection();
            connection.setRequestMethod("POST");
            connection.setDoOutput(true);
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(30000);
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setRequestProperty("Authorization", "Bearer " + token);

            OutputStream outputStream = connection.getOutputStream();
            outputStream.write(jsonBody.getBytes(StandardCharsets.UTF_8));
            outputStream.flush();
            outputStream.close();

            int status = connection.getResponseCode();
            String body = readFully(status >= 400 ? connection.getErrorStream() : connection.getInputStream());
            if (status >= 400) {
                logError("API POST " + path + " failed HTTP " + status);
                throw new ApiException(status, firstJsonMessage(body, "Falha ao comunicar com a API principal."));
            }
            logInfo("API POST " + path + " success HTTP " + status);
            return body == null || body.trim().isEmpty() ? "{}" : body.trim();
        }
    }

    private static final class TemplateStore {
        private final List<TemplateRecord> records;

        private TemplateStore(List<TemplateRecord> records) {
            this.records = records;
        }

        static TemplateStore load() throws IOException {
            String raw = new String(Files.readAllBytes(STORE_PATH), StandardCharsets.UTF_8).trim();
            List<TemplateRecord> items = new ArrayList<TemplateRecord>();
            if (raw.length() < 2) {
                return new TemplateStore(items);
            }

            Matcher matcher = Pattern.compile("\\{(.*?)\\}", Pattern.DOTALL).matcher(raw);
            while (matcher.find()) {
                String item = matcher.group();
                items.add(new TemplateRecord(
                    Json.simpleValue(item, "employeeId"),
                    Json.simpleValue(item, "biometricExternalId"),
                    Json.simpleValue(item, "base64Fmd"),
                    Json.simpleValue(item, "readerName"),
                    Json.simpleValue(item, "updatedAt")
                ));
            }
            return new TemplateStore(items);
        }

        void upsert(TemplateRecord record) {
            for (int i = 0; i < records.size(); i++) {
                if (records.get(i).employeeId.equals(record.employeeId)) {
                    records.set(i, record);
                    return;
                }
            }
            records.add(record);
        }

        void save() throws IOException {
            StringBuilder json = new StringBuilder();
            json.append("[");
            for (int i = 0; i < records.size(); i++) {
                if (i > 0) {
                    json.append(",");
                }
                TemplateRecord item = records.get(i);
                json.append("{")
                    .append("\"employeeId\":").append(quote(item.employeeId)).append(",")
                    .append("\"biometricExternalId\":").append(quote(item.biometricExternalId)).append(",")
                    .append("\"base64Fmd\":").append(quote(item.base64Fmd)).append(",")
                    .append("\"readerName\":").append(quote(item.readerName)).append(",")
                    .append("\"updatedAt\":").append(quote(item.updatedAt))
                    .append("}");
            }
            json.append("]");
            Files.write(STORE_PATH, json.toString().getBytes(StandardCharsets.UTF_8));
        }
    }

    private static final class TemplateRecord {
        private final String employeeId;
        private final String biometricExternalId;
        private final String base64Fmd;
        private final String readerName;
        private final String updatedAt;

        private TemplateRecord(String employeeId, String biometricExternalId, String base64Fmd, String readerName, String updatedAt) {
            this.employeeId = employeeId;
            this.biometricExternalId = biometricExternalId;
            this.base64Fmd = base64Fmd;
            this.readerName = readerName;
            this.updatedAt = updatedAt;
        }
    }

    private static final class CapturedTemplate {
        private final String base64Fmd;
        private final String readerName;

        private CapturedTemplate(String base64Fmd, String readerName) {
            this.base64Fmd = base64Fmd;
            this.readerName = readerName;
        }
    }

    private static final class MatchResult {
        private final TemplateRecord record;
        private final int score;

        private MatchResult(TemplateRecord record, int score) {
            this.record = record;
            this.score = score;
        }
    }

    private static final class RequestData {
        private final String employeeId;
        private final String apiBaseUrl;
        private final String token;

        private RequestData(String employeeId, String apiBaseUrl, String token) {
            this.employeeId = employeeId;
            this.apiBaseUrl = apiBaseUrl;
            this.token = token;
        }

        static RequestData fromJson(String json) {
            return new RequestData(
                Json.simpleValue(json, "employeeId"),
                Json.simpleValue(json, "apiBaseUrl"),
                Json.simpleValue(json, "token")
            );
        }
    }

    private static final class Json {
        private static String simpleValue(String json, String key) {
            Pattern pattern = Pattern.compile("\"" + Pattern.quote(key) + "\"\\s*:\\s*\"((?:\\\\.|[^\\\\\"])*)\"");
            Matcher matcher = pattern.matcher(json);
            if (!matcher.find()) {
                return null;
            }
            return unescapeJson(matcher.group(1));
        }
    }

    private static final class ApiException extends Exception {
        private final int statusCode;

        private ApiException(int statusCode, String message) {
            super(message);
            this.statusCode = statusCode;
        }
    }

    private static String readBody(HttpExchange exchange) throws IOException {
        return readFully(exchange.getRequestBody());
    }

    private static String readFully(InputStream inputStream) throws IOException {
        if (inputStream == null) {
            return "";
        }
        BufferedReader reader = new BufferedReader(new InputStreamReader(inputStream, StandardCharsets.UTF_8));
        StringBuilder content = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) {
            content.append(line);
        }
        return content.toString();
    }

    private static void sendJson(HttpExchange exchange, int statusCode, String body) throws IOException {
        byte[] payload = body.getBytes(StandardCharsets.UTF_8);
        Headers headers = corsHeaders(exchange);
        headers.set("Content-Type", "application/json; charset=utf-8");
        exchange.sendResponseHeaders(statusCode, payload.length);
        OutputStream responseBody = exchange.getResponseBody();
        responseBody.write(payload);
        responseBody.close();
    }

    private static boolean handleCors(HttpExchange exchange) throws IOException {
        if (!"OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
            return false;
        }

        Headers headers = corsHeaders(exchange);
        exchange.sendResponseHeaders(204, -1);
        exchange.close();
        return true;
    }

    private static Headers corsHeaders(HttpExchange exchange) {
        Headers headers = exchange.getResponseHeaders();
        headers.set("Access-Control-Allow-Origin", "*");
        headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
        return headers;
    }

    private static void require(String value, String fieldName) {
        if (value == null || value.trim().isEmpty()) {
            throw new IllegalArgumentException("Campo obrigatorio ausente: " + fieldName);
        }
    }

    private static String normalizeMessage(Exception exception) {
        String message = exception.getMessage();
        if (message == null || message.trim().isEmpty()) {
            return exception.getClass().getSimpleName();
        }
        return message;
    }

    private static String firstJsonMessage(String body, String fallback) {
        if (body == null || body.trim().isEmpty()) {
            return fallback;
        }

        String message = Json.simpleValue(body, "message");
        if (message != null && message.length() > 0) {
            return message;
        }

        return fallback;
    }

    private static String quote(String value) {
        return "\"" + escapeJson(value == null ? "" : value) + "\"";
    }

    private static String safe(String value) {
        return value == null ? "" : value;
    }

    private static String escapeJson(String value) {
        StringBuilder escaped = new StringBuilder();
        for (int i = 0; i < value.length(); i++) {
            char current = value.charAt(i);
            switch (current) {
                case '\\':
                    escaped.append("\\\\");
                    break;
                case '"':
                    escaped.append("\\\"");
                    break;
                case '\b':
                    escaped.append("\\b");
                    break;
                case '\f':
                    escaped.append("\\f");
                    break;
                case '\n':
                    escaped.append("\\n");
                    break;
                case '\r':
                    escaped.append("\\r");
                    break;
                case '\t':
                    escaped.append("\\t");
                    break;
                default:
                    if (current < 0x20) {
                        String hex = Integer.toHexString(current);
                        escaped.append("\\u");
                        for (int padding = hex.length(); padding < 4; padding++) {
                            escaped.append('0');
                        }
                        escaped.append(hex);
                    } else {
                        escaped.append(current);
                    }
                    break;
            }
        }
        return escaped.toString();
    }

    private static String unescapeJson(String value) {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        for (int i = 0; i < value.length(); i++) {
            char current = value.charAt(i);
            if (current == '\\' && i + 1 < value.length()) {
                char next = value.charAt(++i);
                switch (next) {
                    case '"':
                        output.write('"');
                        break;
                    case '\\':
                        output.write('\\');
                        break;
                    case '/':
                        output.write('/');
                        break;
                    case 'b':
                        output.write('\b');
                        break;
                    case 'f':
                        output.write('\f');
                        break;
                    case 'n':
                        output.write('\n');
                        break;
                    case 'r':
                        output.write('\r');
                        break;
                    case 't':
                        output.write('\t');
                        break;
                    case 'u':
                        if (i + 4 < value.length()) {
                            String hex = value.substring(i + 1, i + 5);
                            output.write((char) Integer.parseInt(hex, 16));
                            i += 4;
                        }
                        break;
                    default:
                        output.write(next);
                        break;
                }
            } else {
                output.write(current);
            }
        }
        return new String(output.toByteArray(), StandardCharsets.UTF_8);
    }

    private static synchronized void logInfo(String message) {
        logLine("INFO", message);
    }

    private static synchronized void logError(String message) {
        logLine("ERROR", message);
    }

    private static void logLine(String level, String message) {
        String line = LOG_TIME_FORMAT.format(LocalDateTime.now()) + " [" + level + "] " + safe(message);
        System.out.println(line);
        try {
            ensureLogFile();
            Files.write(LOG_PATH, (line + System.lineSeparator()).getBytes(StandardCharsets.UTF_8), java.nio.file.StandardOpenOption.APPEND);
        } catch (Exception ignored) {
        }
    }
}
