package com.osakalunch.backend.push;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.net.URI;
import java.net.URISyntaxException;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * 알림 허용한 브라우저 저장(화면이 부름)과 '보낼 알림 보내기'(GitHub Actions가 부름)
 */
@RestController
public class PushController {

    /** 알려진 푸시 서비스로만 보냄. 다른 주소를 넣어 서버가 엉뚱한 곳을 부르게 하는 것을 막음 */
    static final List<String> PUSH_HOSTS = List.of(
            "fcm.googleapis.com",               // 크롬 · 안드로이드
            "push.apple.com",                   // 아이폰 · 맥 사파리 (web.push.apple.com)
            "push.services.mozilla.com",        // 파이어폭스
            "notify.windows.com");              // 엣지

    private final PushSubscriptionRepository subscriptions;
    private final PushJob job;
    private final PushSender sender;
    private final String cronSecret;

    public PushController(PushSubscriptionRepository subscriptions, PushJob job, PushSender sender,
                          @Value("${push.cron-secret:}") String cronSecret) {
        this.subscriptions = subscriptions;
        this.job = job;
        this.sender = sender;
        this.cronSecret = cronSecret;
    }

    /** 브라우저 PushSubscription의 endpoint · keys.p256dh · keys.auth */
    public record SubscribeRequest(
            @NotBlank @Size(max = 1000) String endpoint,
            @NotBlank @Size(max = 200) String p256dh,
            @NotBlank @Size(max = 100) String auth) {
    }

    /** 알림 허용 저장. 같은 브라우저가 다시 보내면(앱을 열 때마다) 한 줄을 고쳐 씀 */
    @PostMapping("/api/push/subscriptions")
    public ResponseEntity<Void> subscribe(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody SubscribeRequest req) {
        UUID user = userId(jwt);
        if (!knownPushService(req.endpoint()) || !validKeys(req.p256dh(), req.auth())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "알림 구독 정보가 맞지 않아요");
        }
        Instant now = Instant.now();
        PushSubscription sub = subscriptions.findByEndpoint(req.endpoint())
                .map(found -> {
                    found.renew(user, req.p256dh(), req.auth(), now);
                    return found;
                })
                .orElseGet(() -> new PushSubscription(user, req.endpoint(), req.p256dh(), req.auth(), now));
        subscriptions.save(sub);
        return ResponseEntity.noContent().build();
    }

    /** 보낼 알림 보내기. GitHub Actions만 아는 비밀 값(X-Cron-Secret)이 맞아야 함 */
    @PostMapping("/internal/push/send-due")
    public PushJob.Result sendDue(@RequestHeader(value = "X-Cron-Secret", required = false) String secret) {
        if (cronSecret.isBlank() || !sender.ready()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "알림 설정(PUSH_CRON_SECRET · VAPID 키)이 없어요");
        }
        if (secret == null || !MessageDigest.isEqual(secret.getBytes(StandardCharsets.UTF_8), cronSecret.getBytes(StandardCharsets.UTF_8))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        return job.run(Instant.now());
    }

    static boolean knownPushService(String endpoint) {
        try {
            URI uri = new URI(endpoint);
            String host = uri.getHost();
            return "https".equals(uri.getScheme()) && host != null
                    && PUSH_HOSTS.stream().anyMatch(h -> host.equals(h) || host.endsWith("." + h));
        } catch (URISyntaxException e) {
            return false;
        }
    }

    private static boolean validKeys(String p256dh, String auth) {
        try {
            WebPushCrypto.publicKey(WebPushCrypto.unb64(p256dh));
            return WebPushCrypto.unb64(auth).length == 16;
        } catch (IllegalArgumentException | GeneralSecurityException e) {
            return false;
        }
    }

    private static UUID userId(Jwt jwt) {
        try {
            return UUID.fromString(jwt.getSubject());
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        }
    }
}
