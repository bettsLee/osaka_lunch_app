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

    /** 내가 가장 최근에 고른 기록 (from 뒤에 고른 것 중, 취소 · 답 여부와 상관없이) */
    Optional<Visit> findFirstByUserIdAndChosenAtAfterOrderByChosenAtDesc(UUID userId, Instant from);

    /** 도감: 도착했거나 '네, 다녀왔어요'라고 답한 기록, 최근 것부터. 가게가 닫혀 있던 곳은 먹지 않았으니 뺌 (10/23 결정) */
    @Query("select v from Visit v where v.userId = :userId and v.visited = true and (v.openOk is null or v.openOk = true) order by v.chosenAt desc")
    List<Visit> findZukan(@Param("userId") UUID userId, Pageable page);

    /** 또 갈래요를 켜고 끌 때: 그 가게에 다녀온 기록 모두 */
    List<Visit> findByUserIdAndShopIdAndVisitedTrue(UUID userId, String shopId);

    /** 알림 보낼 기록: 답도 알림도 취소도 아직이고, 도착 안 했으면 고른 시각 · 도착했으면 도착 시각이 기간 안.
     *  그 사람이 가장 최근에 고른 기록만 (10/24 결정: 새로 고른 가게가 있으면 예전 기록은 묻지 않음) */
    @Query("""
            select v from Visit v
            where v.answeredAt is null and v.notifiedAt is null and v.cancelledAt is null
              and ((v.arrivedAt is null and v.chosenAt between :chosenFrom and :chosenTo)
                or (v.arrivedAt is not null and v.arrivedAt between :arrivedFrom and :arrivedTo))
              and not exists (select n from Visit n where n.userId = v.userId and n.chosenAt > v.chosenAt)
            """)
    List<Visit> findPushDue(@Param("chosenFrom") Instant chosenFrom, @Param("chosenTo") Instant chosenTo,
                            @Param("arrivedFrom") Instant arrivedFrom, @Param("arrivedTo") Instant arrivedTo);
}
