package com.osakalunch.backend.visit;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/**
 * '여기 갈래요' 한 번 = 한 줄. 나중에 '다녀왔어요?' 답을 같은 줄에 채움 (supabase/migrations/003_create_visits.sql)
 */
@Entity
@Table(name = "visits")
public class Visit {

    @Id
    private UUID id; // 화면이 만든 id. 저장을 다시 보내도 한 번만 남게

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "shop_id", nullable = false)
    private String shopId;

    @Column(name = "shop_name", nullable = false)
    private String shopName;

    @Column(nullable = false)
    private String source;

    @Column(name = "distance_km")
    private Double distanceKm;

    @Column(name = "price_limit", nullable = false)
    private Integer priceLimit;

    @Column(name = "chosen_at", nullable = false)
    private Instant chosenAt;

    private Boolean visited;

    @Column(name = "open_ok")
    private Boolean openOk;

    @Column(name = "price_ok")
    private Boolean priceOk;

    @Column(name = "answered_at")
    private Instant answeredAt;

    @Column(name = "notified_at")
    private Instant notifiedAt; // '다녀왔어요?' 알림을 보낸 시각 (004)

    @Column(name = "cancelled_at")
    private Instant cancelledAt; // 정했다가 취소한 시각 (007). 취소하면 알림 · 질문 카드에서 빠짐

    @Column(name = "arrived_at")
    private Instant arrivedAt; // 도착했어요 (009). 도착하면 다녀온 것으로 보고 도감에 바로 넣음

    @Column(name = "arrived_by")
    private String arrivedBy; // auto: 앱을 열 때 가게 근처 / manual: '도착했어요' 버튼

    protected Visit() {
    }

    public Visit(UUID id, UUID userId, String shopId, String shopName, String source,
                 Double distanceKm, Integer priceLimit, Instant chosenAt) {
        this.id = id;
        this.userId = userId;
        this.shopId = shopId;
        this.shopName = shopName;
        this.source = source;
        this.distanceKm = distanceKm;
        this.priceLimit = priceLimit;
        this.chosenAt = chosenAt;
    }

    /** '다녀왔어요?' 답. 안 갔으면 영업 · 가격은 모르는 것으로 비워 둠 */
    public void answer(boolean visited, Boolean openOk, Boolean priceOk, Instant at) {
        this.visited = visited;
        this.openOk = visited ? openOk : null;
        this.priceOk = visited ? priceOk : null;
        this.answeredAt = at;
    }

    public void markNotified(Instant at) {
        this.notifiedAt = at;
    }

    /** 도착했어요. 다시 불러도 처음 도착 시각 · 방법은 그대로, 그 자리에서 영업 여부를 답했으면 같이.
     *  영업을 안 했으면 가격은 알 수 없어서 더 물을 게 없음 → 답한 것으로 (질문 카드 · 알림에서 빠짐) */
    public void arrive(String by, Boolean openOk, Instant at) {
        if (this.arrivedAt == null) {
            this.arrivedAt = at;
            this.arrivedBy = by;
        }
        this.visited = true;
        if (openOk != null) this.openOk = openOk;
        if (Boolean.FALSE.equals(openOk)) {
            this.priceOk = null;
            this.answeredAt = at;
        }
    }

    /** 여기 갈래요 취소. 이미 취소했으면 처음 시각을 그대로 둠 */
    public void cancel(Instant at) {
        if (this.cancelledAt == null) this.cancelledAt = at;
    }

    public UUID getId() { return id; }
    public UUID getUserId() { return userId; }
    public String getShopId() { return shopId; }
    public String getShopName() { return shopName; }
    public Integer getPriceLimit() { return priceLimit; }
    public Instant getChosenAt() { return chosenAt; }
    public Boolean getVisited() { return visited; }
    public Boolean getOpenOk() { return openOk; }
    public Boolean getPriceOk() { return priceOk; }
    public Instant getAnsweredAt() { return answeredAt; }
    public Instant getNotifiedAt() { return notifiedAt; }
    public Instant getCancelledAt() { return cancelledAt; }
    public Instant getArrivedAt() { return arrivedAt; }
    public String getArrivedBy() { return arrivedBy; }
}
