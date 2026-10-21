package com.osakalunch.backend.opinion;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/**
 * 설정 화면에서 보낸 의견 하나 = 한 줄 (supabase/migrations/006_create_opinions.sql)
 */
@Entity
@Table(name = "opinions")
public class Opinion {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(nullable = false, length = 1000)
    private String message;

    @Column(length = 20)
    private String lang;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected Opinion() {
    }

    public Opinion(UUID userId, String message, String lang, Instant at) {
        this.id = UUID.randomUUID();
        this.userId = userId;
        this.message = message;
        this.lang = lang;
        this.createdAt = at;
    }

    public UUID getUserId() { return userId; }
    public String getMessage() { return message; }
    public String getLang() { return lang; }
}
