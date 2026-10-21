package com.osakalunch.backend.i18n;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 번역할 원문: 운영 화면이 올려 둔 /i18n/ko.json (화면과 서버가 같은 파일 하나를 씀)
 * 10분 동안은 받아 둔 것을 쓰고, 파일 내용의 해시가 버전 (문구가 바뀌면 버전이 바뀌어 다시 번역)
 */
@Component
public class SourceCatalog {

    public record Source(String version, Map<String, String> messages) {
    }

    static final Duration KEEP = Duration.ofMinutes(10);

    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    private final URI url;
    private final ObjectMapper json;
    private volatile Source cached;
    private volatile Instant fetchedAt = Instant.EPOCH;

    public SourceCatalog(@Value("${app.web-origin}") String webOrigin, ObjectMapper json) {
        this.url = URI.create(webOrigin.replaceAll("/+$", "") + "/i18n/ko.json");
        this.json = json;
    }

    public Source current() throws IOException, InterruptedException {
        Source keep = cached;
        if (keep != null && fetchedAt.plus(KEEP).isAfter(Instant.now())) return keep;
        HttpResponse<byte[]> res = http.send(HttpRequest.newBuilder(url).timeout(Duration.ofSeconds(15)).GET().build(),
                HttpResponse.BodyHandlers.ofByteArray());
        if (res.statusCode() != 200) throw new IOException("원문 문구를 받지 못했어요 (" + res.statusCode() + ")");
        Map<String, String> messages = json.readValue(res.body(), new TypeReference<LinkedHashMap<String, String>>() {
        });
        cached = new Source(version(res.body()), messages);
        fetchedAt = Instant.now();
        return cached;
    }

    static String version(byte[] body) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(body)).substring(0, 16);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
