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

    public UUID getId() { return id; }
    public UUID getUserId() { return userId; }
    public String getShopId() { return shopId; }
    public String getShopName() { return shopName; }
    public Instant getChosenAt() { return chosenAt; }
    public Boolean getVisited() { return visited; }
    public Boolean getOpenOk() { return openOk; }
    public Boolean getPriceOk() { return priceOk; }
    public Instant getAnsweredAt() { return answeredAt; }
}
