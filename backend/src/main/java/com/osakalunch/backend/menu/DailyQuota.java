package com.osakalunch.backend.menu;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDate;

/**
 * 대표 메뉴 · 손님 사진의 하루 한도 (11/24, OL-93). 쓴 수를 DB(daily_usage)에 세서 서버가 다시 켜져도 이어서 셈.
 * 요청이 동시에 와도 그날 줄을 잠그고 세서 한도를 넘지 않음
 */
@Component
public class DailyQuota {

    private static final Logger log = LoggerFactory.getLogger(DailyQuota.class);

    private final JdbcTemplate db;
    private final TransactionTemplate tx;

    public DailyQuota(JdbcTemplate db, PlatformTransactionManager transactions) {
        this.db = db;
        this.tx = new TransactionTemplate(transactions);
    }

    /** 그날 남은 수 안에서 최대 want만큼 잡고, 잡은 수를 돌려줌. DB에 못 쓰면 0 (돈이 나가지 않는 쪽으로) */
    public int take(LocalDate day, String kind, int want, int limit) {
        try {
            Integer got = tx.execute(status -> {
                db.update("insert into daily_usage (day, kind, used) values (?, ?, 0) on conflict do nothing", day, kind);
                Integer used = db.queryForObject("select used from daily_usage where day = ? and kind = ? for update", Integer.class, day, kind);
                int n = Math.max(0, Math.min(want, limit - (used == null ? 0 : used)));
                if (n > 0) db.update("update daily_usage set used = used + ? where day = ? and kind = ?", n, day, kind);
                return n;
            });
            return got == null ? 0 : got;
        } catch (RuntimeException e) {
            log.warn("하루 한도를 세지 못해 막음 ({}): {}", kind, e.getMessage());
            return 0;
        }
    }

    /** 잡았다가 쓰지 않은 수를 그날 한도에 돌려줌 */
    public void giveBack(LocalDate day, String kind, int n) {
        if (n <= 0) return;
        try {
            db.update("update daily_usage set used = greatest(0, used - ?) where day = ? and kind = ?", n, day, kind);
        } catch (RuntimeException e) {
            log.warn("하루 한도를 돌려주지 못함 ({}): {}", kind, e.getMessage());
        }
    }
}
