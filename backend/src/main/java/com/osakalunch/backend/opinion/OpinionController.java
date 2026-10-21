package com.osakalunch.backend.opinion;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

/**
 * 의견 보내기 (설정 화면 S8, 10/21 결정: 앱 안 입력칸). 익명 로그인 토큰이 있어야 하고, 한 사람이 하루에 5개까지
 */
@RestController
public class OpinionController {

    static final int MAX_LENGTH = 1000;
    static final int MAX_PER_DAY = 5; // 잘못 누르거나 같은 내용을 여러 번 보내도 표가 넘치지 않게

    private final OpinionRepository opinions;

    public OpinionController(OpinionRepository opinions) {
        this.opinions = opinions;
    }

    public record OpinionRequest(
            @NotBlank @Size(max = MAX_LENGTH) String message,
            @Size(max = 20) @Pattern(regexp = "[A-Za-z-]*") String lang) {
    }

    @PostMapping("/api/opinions")
    public ResponseEntity<Void> send(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody OpinionRequest req) {
        UUID user = userId(jwt);
        Instant now = Instant.now();
        if (opinions.countByUserIdAndCreatedAtAfter(user, now.minus(Duration.ofDays(1))) >= MAX_PER_DAY) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "의견은 하루에 5개까지 보낼 수 있어요");
        }
        opinions.save(new Opinion(user, req.message().strip(), req.lang(), now));
        return ResponseEntity.noContent().build();
    }

    private static UUID userId(Jwt jwt) {
        try {
            return UUID.fromString(jwt.getSubject());
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        }
    }
}
