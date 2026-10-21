package com.osakalunch.backend.i18n;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

/**
 * 한 언어의 번역본 = 한 줄 (supabase/migrations/005_create_translations.sql)
 */
@Entity
@Table(name = "translations")
public class Translation {

    @Id
    private String id; // 언어:원문버전

    @Column(nullable = false)
    private String lang;

    @Column(nullable = false)
    private String version;

    @Column(nullable = false, columnDefinition = "text")
    private String messages;

    @Column(nullable = false)
    private String model;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected Translation() {
    }

    public Translation(String lang, String version, String messages, String model, Instant at) {
        this.id = key(lang, version);
        this.lang = lang;
        this.version = version;
        this.messages = messages;
        this.model = model;
        this.createdAt = at;
    }

    static String key(String lang, String version) {
        return lang + ":" + version;
    }

    public String getMessages() { return messages; }
    public String getVersion() { return version; }
}
