package com.osakalunch.backend.shop;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

/**
 * 가게 소개 번역 하나 = 한 줄 (supabase/migrations/008_create_shop_translations.sql)
 */
@Entity
@Table(name = "shop_translations")
public class ShopTranslation {

    @Id
    private String id; // 가게 id:언어

    @Column(name = "shop_id", nullable = false)
    private String shopId;

    @Column(nullable = false)
    private String lang;

    @Column(name = "source_hash", nullable = false)
    private String sourceHash;

    @Column(nullable = false, columnDefinition = "text")
    private String text;

    @Column(nullable = false)
    private String model;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected ShopTranslation() {
    }

    public ShopTranslation(String shopId, String lang, String sourceHash, String text, String model, Instant at) {
        this.id = key(shopId, lang);
        this.shopId = shopId;
        this.lang = lang;
        update(sourceHash, text, model, at);
    }

    /** 원문이 바뀌어 다시 번역함 */
    public void update(String sourceHash, String text, String model, Instant at) {
        this.sourceHash = sourceHash;
        this.text = text;
        this.model = model;
        this.createdAt = at;
    }

    static String key(String shopId, String lang) {
        return shopId + ":" + lang;
    }

    public String getSourceHash() { return sourceHash; }
    public String getText() { return text; }
}
