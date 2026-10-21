package com.osakalunch.backend.opinion;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.UUID;

public interface OpinionRepository extends JpaRepository<Opinion, UUID> {

    /** 이 사람이 since 이후에 보낸 의견 수 (하루 제한) */
    long countByUserIdAndCreatedAtAfter(UUID userId, Instant since);
}
