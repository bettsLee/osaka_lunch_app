package com.osakalunch.backend.push;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/**
 * 알림을 허용한 브라우저 하나 = 한 줄 (supabase/migrations/004_create_push_subscriptions.sql)
 */
@Entity
@Table(name = "push_subscriptions")
public class PushSubscription {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(nullable = false, unique = true, length = 1000)
    private String endpoint;

    @Column(nullable = false)
    private String p256dh;

    @Column(nullable = false)
    private String auth;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected PushSubscription() {
    }

    public PushSubscription(UUID userId, String endpoint, String p256dh, String auth, Instant at) {
        this.id = UUID.randomUUID();
        this.userId = userId;
        this.endpoint = endpoint;
        this.p256dh = p256dh;
        this.auth = auth;
        this.createdAt = at;
        this.updatedAt = at;
    }

    /** 같은 브라우저가 다시 보냄: 익명 사용자가 바뀌었거나 키가 새로 발급된 경우 */
    public void renew(UUID userId, String p256dh, String auth, Instant at) {
        this.userId = userId;
        this.p256dh = p256dh;
        this.auth = auth;
        this.updatedAt = at;
    }

    public UUID getId() { return id; }
    public UUID getUserId() { return userId; }
    public String getEndpoint() { return endpoint; }
    public String getP256dh() { return p256dh; }
    public String getAuth() { return auth; }
}
