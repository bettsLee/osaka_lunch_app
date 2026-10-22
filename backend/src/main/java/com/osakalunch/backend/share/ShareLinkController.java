package com.osakalunch.backend.share;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.UUID;

/**
 * 맛집 추천 짧은 링크 (10/22 결정: 링크가 너무 길어서 짧은 코드). 만들기는 익명 로그인 필요, 읽기는 누구나(받은 사람)
 */
@RestController
public class ShareLinkController {

    static final int MAX_SHOPS = 10;       // 화면과 같음 (lib/share.ts SHARE_MAX)
    static final int MAX_PER_DAY = 50;     // 한 사람이 하루에 만들 수 있는 링크 수 (잘못 눌러도 넉넉하게)
    static final int CODE_LENGTH = 6;      // 62^6 ≈ 568억 가지
    static final String CODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

    private final ShareLinkRepository links;
    private final SecureRandom random = new SecureRandom();

    public ShareLinkController(ShareLinkRepository links) {
        this.links = links;
    }

    public record CreateRequest(@NotEmpty @Size(max = MAX_SHOPS) List<@Pattern(regexp = "[A-Za-z0-9_-]{1,40}") String> shopIds) {
    }

    public record CodeResponse(String code) {
    }

    public record ShopsResponse(List<String> shopIds) {
    }

    @PostMapping("/api/share-links")
    public ResponseEntity<CodeResponse> create(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody CreateRequest req) {
        UUID user = userId(jwt);
        Instant now = Instant.now();
        if (links.countByUserIdAndCreatedAtAfter(user, now.minus(Duration.ofDays(1))) >= MAX_PER_DAY) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "추천 링크는 하루에 50개까지 만들 수 있어요");
        }
        List<String> ids = List.copyOf(new LinkedHashSet<>(req.shopIds())); // 겹치면 하나
        for (int i = 0; i < 5; i++) { // 코드가 겹치면 다시 (거의 일어나지 않음)
            String code = newCode();
            if (!links.existsById(code)) {
                links.save(new ShareLink(code, user, ids, now));
                return ResponseEntity.status(HttpStatus.CREATED).body(new CodeResponse(code));
            }
        }
        throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "코드를 만들지 못했어요");
    }

    /** 받은 사람: 코드 → 가게 번호 (보낸 사람 정보는 돌려주지 않음) */
    @GetMapping("/api/share-links/{code}")
    public ShopsResponse read(@PathVariable String code) {
        if (!code.matches("[A-Za-z0-9]{" + CODE_LENGTH + "}")) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        return links.findById(code)
                .map(link -> new ShopsResponse(link.getShopIds()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    private String newCode() {
        StringBuilder sb = new StringBuilder(CODE_LENGTH);
        for (int i = 0; i < CODE_LENGTH; i++) sb.append(CODE_CHARS.charAt(random.nextInt(CODE_CHARS.length())));
        return sb.toString();
    }

    private static UUID userId(Jwt jwt) {
        try {
            return UUID.fromString(jwt.getSubject());
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        }
    }
}
