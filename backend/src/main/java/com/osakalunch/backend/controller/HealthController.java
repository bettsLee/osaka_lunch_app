package com.osakalunch.backend.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;
import java.util.Optional;

@RestController
public class HealthController {

    /** 지금 떠 있는 서버의 배포 커밋. Render가 넣어 줌 (내 컴퓨터 · 테스트에서는 unknown) */
    static final String COMMIT = Optional.ofNullable(System.getenv("RENDER_GIT_COMMIT"))
            .filter(s -> !s.isBlank()).orElse("unknown");

    /** 서버 깨우기 · 배포 확인용 (10/26: 배포 확인 단계가 commit을 main과 비교) */
    @GetMapping("/health")
    public Map<String, String> health() {
        return Map.of("status", "OK", "commit", COMMIT);
    }
}
