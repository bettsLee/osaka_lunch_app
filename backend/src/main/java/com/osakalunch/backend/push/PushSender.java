package com.osakalunch.backend.push;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.security.GeneralSecurityException;
import java.security.interfaces.ECPrivateKey;
import java.time.Duration;
import java.time.Instant;

/**
 * 푸시 서비스(구글 FCM · 애플 · 모질라 등)에 알림 한 건을 보냄. VAPID 키는 Render 환경 변수에만 둠
 */
@Component
public class PushSender {

    private static final Logger log = LoggerFactory.getLogger(PushSender.class);
    static final Duration TTL = Duration.ofHours(3); // 휴대폰이 꺼져 있으면 3시간까지만 기다렸다 전달

    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    private final String publicKey;
    private final String subject;
    private final ECPrivateKey privateKey;

    public PushSender(@Value("${push.vapid.public-key:}") String publicKey,
                      @Value("${push.vapid.private-key:}") String privateKey,
                      @Value("${push.vapid.subject}") String subject) {
        this.publicKey = publicKey.trim();
        this.subject = subject;
        this.privateKey = parse(this.publicKey, privateKey);
    }

    /** 키가 없거나 잘못됐으면 발송만 꺼짐 (서버의 다른 기능은 그대로) */
    private static ECPrivateKey parse(String publicKey, String privateKey) {
        if (publicKey.isBlank() || privateKey.isBlank()) return null;
        try {
            WebPushCrypto.publicKey(WebPushCrypto.unb64(publicKey));
            return WebPushCrypto.privateKey(WebPushCrypto.unb64(privateKey));
        } catch (IllegalArgumentException | GeneralSecurityException e) {
            log.error("VAPID 키 형식이 맞지 않아 알림을 보내지 않아요: {}", e.getMessage());
            return null;
        }
    }

    public boolean ready() {
        return privateKey != null;
    }

    /** 보낸 뒤 푸시 서비스의 응답 코드. 201 성공, 404 · 410 구독 만료 */
    public int send(PushSubscription sub, byte[] payload) throws IOException, InterruptedException, GeneralSecurityException {
        byte[] body = WebPushCrypto.encrypt(payload, WebPushCrypto.unb64(sub.getP256dh()), WebPushCrypto.unb64(sub.getAuth()));
        URI endpoint = URI.create(sub.getEndpoint());
        String audience = endpoint.getScheme() + "://" + endpoint.getHost() + (endpoint.getPort() == -1 ? "" : ":" + endpoint.getPort());
        String jwt = WebPushCrypto.vapidJwt(audience, subject, Instant.now().plus(Duration.ofHours(1)).getEpochSecond(), privateKey);
        HttpRequest request = HttpRequest.newBuilder(endpoint)
                .timeout(Duration.ofSeconds(15))
                .header("TTL", String.valueOf(TTL.toSeconds()))
                .header("Urgency", "normal")
                .header("Content-Encoding", "aes128gcm")
                .header("Content-Type", "application/octet-stream")
                .header("Authorization", "vapid t=" + jwt + ", k=" + publicKey)
                .POST(HttpRequest.BodyPublishers.ofByteArray(body))
                .build();
        return http.send(request, HttpResponse.BodyHandlers.discarding()).statusCode();
    }
}
