package com.osakalunch.backend.visit;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface VisitRepository extends JpaRepository<Visit, UUID> {

    /** 아직 답하지 않고 취소하지 않은 가장 최근 기록 (chosenAt이 from ~ to 사이) */
    Optional<Visit> findFirstByUserIdAndAnsweredAtIsNullAndCancelledAtIsNullAndChosenAtBetweenOrderByChosenAtDesc(
            UUID userId, Instant from, Instant to);

    /** 도감: '네, 다녀왔어요'라고 답한 기록, 최근 것부터 */
    List<Visit> findTop200ByUserIdAndVisitedTrueOrderByChosenAtDesc(UUID userId);

    /** 알림 보낼 기록: 답도 알림도 취소도 아직이고 chosenAt이 from ~ to 사이 */
    List<Visit> findByAnsweredAtIsNullAndNotifiedAtIsNullAndCancelledAtIsNullAndChosenAtBetween(Instant from, Instant to);
}
