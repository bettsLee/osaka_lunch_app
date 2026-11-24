package com.osakalunch.backend.menu;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;

import java.io.Serializable;
import java.time.LocalDate;
import java.util.Objects;

/**
 * 하루 사용량 한 줄 = 오사카 날짜 × 종류 (supabase/migrations/016_daily_usage.sql).
 * 읽고 쓰는 건 DailyQuota가 SQL로 함. 이 클래스는 테스트 DB에 같은 표를 만들려고 둠
 */
@Entity
@Table(name = "daily_usage")
@IdClass(DailyUsage.Key.class)
public class DailyUsage {

    @Id
    private LocalDate day;

    @Id
    @Column(length = 20)
    private String kind;

    @Column(nullable = false)
    private int used;

    protected DailyUsage() {
    }

    public static class Key implements Serializable {
        private LocalDate day;
        private String kind;

        @Override
        public boolean equals(Object o) {
            return o instanceof Key k && Objects.equals(day, k.day) && Objects.equals(kind, k.kind);
        }

        @Override
        public int hashCode() {
            return Objects.hash(day, kind);
        }
    }
}
