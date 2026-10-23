package com.osakalunch.backend.visit;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface VisitRepository extends JpaRepository<Visit, UUID> {

    /** 아직 답하지 않고 취소하지 않은 가장 최근 기록 (chosenAt이 from ~ to 사이) */
    Optional<Visit> findFirstByUserIdAndAnsweredAtIsNullAndCancelledAtIsNullAndChosenAtBetweenOrderByChosenAtDesc(
            UUID userId, Instant from, Instant to);

    /** 도감: 도착했거나 '네, 다녀왔어요'라고 답한 기록, 최근 것부터. 가게가 닫혀 있던 곳은 먹지 않았으니 뺌 (10/23 결정) */
    @Query("select v from Visit v where v.userId = :userId and v.visited = true and (v.openOk is null or v.openOk = true) order by v.chosenAt desc")
    List<Visit> findZukan(@Param("userId") UUID userId, Pageable page);

    /** 또 갈래요를 켜고 끌 때: 그 가게에 다녀온 기록 모두 */
    List<Visit> findByUserIdAndShopIdAndVisitedTrue(UUID userId, String shopId);

    /** 알림 보낼 기록: 답도 알림도 취소도 아직이고 chosenAt이 from ~ to 사이 */
    List<Visit> findByAnsweredAtIsNullAndNotifiedAtIsNullAndCancelledAtIsNullAndChosenAtBetween(Instant from, Instant to);
}
