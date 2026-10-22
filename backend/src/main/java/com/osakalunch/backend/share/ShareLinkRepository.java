package com.osakalunch.backend.share;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.UUID;

public interface ShareLinkRepository extends JpaRepository<ShareLink, String> {

    /** 이 사람이 since 이후에 만든 링크 수 (하루 제한) */
    long countByUserIdAndCreatedAtAfter(UUID userId, Instant since);
}
