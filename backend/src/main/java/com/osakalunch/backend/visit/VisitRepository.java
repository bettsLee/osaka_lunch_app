package com.osakalunch.backend.visit;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface VisitRepository extends JpaRepository<Visit, UUID> {

    /** 아직 답하지 않은 가장 최근 기록 (chosenAt이 from ~ to 사이) */
    Optional<Visit> findFirstByUserIdAndAnsweredAtIsNullAndChosenAtBetweenOrderByChosenAtDesc(
            UUID userId, Instant from, Instant to);
}
