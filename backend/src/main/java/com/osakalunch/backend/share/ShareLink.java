package com.osakalunch.backend.share;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;

/**
 * 맛집 추천 짧은 링크 하나 = 한 줄 (supabase/migrations/011_create_share_links.sql)
 */
@Entity
@Table(name = "share_links")
public class ShareLink {

    @Id
    @Column(length = 16)
    private String code;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "shop_ids", nullable = false, length = 500)
    private String shopIds; // 쉼표로 이은 가게 번호

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected ShareLink() {
    }

    public ShareLink(String code, UUID userId, List<String> shopIds, Instant at) {
        this.code = code;
        this.userId = userId;
        this.shopIds = String.join(",", shopIds);
        this.createdAt = at;
    }

    public String getCode() { return code; }
    public UUID getUserId() { return userId; }
    public List<String> getShopIds() { return Arrays.asList(shopIds.split(",")); }
}
