package com.osakalunch.backend.menu;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** Gemini 답 읽기 (11/17 오사카 실험에서 본 모양들) */
class MenuHintClientTest {

    static final List<MenuHint.Source> SRC = List.of(new MenuHint.Source("Hokkyokusei - Google Maps", "https://maps.google.com/?cid=1"));

    @Test
    void 네_줄을_읽어_메뉴와_영업을_꺼냄() {
        MenuHint h = MenuHintClient.parse("""
                STATUS: OPEN
                KIND: LUNCH
                MENU: 치킨 오므라이스(チキンオムライス) · 다이쇼 오므라이스(大正オムライス)
                PRICE: 전체 1,000~2,000엔
                BASIS: 가게 정보, 메뉴 정보
                """, SRC, "ChIJabcdefghij");
        assertThat(h.status()).isEqualTo("ok");
        assertThat(h.place()).isEqualTo("open");
        assertThat(h.menus()).containsExactly("치킨 오므라이스(チキンオムライス)", "다이쇼 오므라이스(大正オムライス)");
        assertThat(h.sources()).isEqualTo(SRC);
        assertThat(h.kind()).isEqualTo("lunch");
        assertThat(h.placeId()).isEqualTo("ChIJabcdefghij");
    }

    @Test
    void 굵은_글씨_쉼표_목록도_읽고_최대_3개() {
        MenuHint h = MenuHintClient.parse("**STATUS:** NO_LUNCH\n- **MENU:** 닭 요리(朝引き鶏), 말고기(熊本の馬肉), 흑돼지(鹿児島の黒豚), 넷째\n", SRC, null);
        assertThat(h.place()).isEqualTo("no_lunch");
        assertThat(h.kind()).isEqualTo("signature"); // KIND 줄이 없으면 '가게 대표 메뉴'로
        assertThat(h.menus()).containsExactly("닭 요리(朝引き鶏)", "말고기(熊本の馬肉)", "흑돼지(鹿児島の黒豚)");
    }

    @Test
    void 일본어_이름_안의_가운뎃점은_나누지_않음() {
        assertThat(MenuHintClient.menus("유바 모둠(ゆば・とりあわせランチ) · 오마카세(おまかせコース)"))
                .containsExactly("유바 모둠(ゆば・とりあわせランチ)", "오마카세(おまかせコース)");
    }

    @Test
    void 모름_폐업_출처없음() {
        assertThat(MenuHintClient.parse("STATUS: PERMANENTLY_CLOSED\nMENU: UNKNOWN", SRC, null))
                .extracting(MenuHint::status, MenuHint::place).containsExactly("unknown", "closed");
        // '지금 닫힘'으로 CLOSED라고만 답하면 폐업으로 보지 않음 (11/17: 점심 뒤 폐업 안내가 잘못 뜸)
        assertThat(MenuHintClient.parse("STATUS: CLOSED\nMENU: UNKNOWN", SRC, null).place()).isEqualTo("unknown");
        assertThat(MenuHintClient.place("CLOSED_NOW")).isEqualTo("unknown");
        assertThat(MenuHintClient.place("NO_LUNCH")).isEqualTo("no_lunch");
        // 구글 지도 출처가 하나도 없으면 지도에서 찾은 답이 아니라서 메뉴를 쓰지 않음
        assertThat(MenuHintClient.parse("STATUS: OPEN\nMENU: 라멘(ラーメン)", List.of(), "ChIJabcdefghij").status()).isEqualTo("unknown");
        assertThat(MenuHintClient.parse("엉뚱한 답", SRC, null).place()).isEqualTo("unknown");
    }

    @Test
    void 출처는_구글_지도_장소만_겹치지_않게_3개까지() throws Exception {
        var meta = new ObjectMapper().readTree("""
                {"groundingChunks": [
                  {"maps": {"uri": "https://maps.google.com/?cid=1", "title": "A - Google Maps"}},
                  {"maps": {"uri": "https://maps.google.com/?cid=1", "title": "A - Google Maps"}},
                  {"web": {"uri": "https://example.com", "title": "web"}},
                  {"maps": {"uri": "javascript:alert(1)", "title": "bad"}},
                  {"maps": {"uri": "https://maps.google.com/?cid=2", "title": "Review of A - Google Maps"}}
                ]}""");
        assertThat(MenuHintClient.sources(meta)).extracting(MenuHint.Source::uri)
                .containsExactly("https://maps.google.com/?cid=1", "https://maps.google.com/?cid=2");
        var withId = new ObjectMapper().readTree("""
                {"groundingChunks": [{"web": {}}, {"maps": {"placeId": "places/ChIJN1t_tDeuEmsRUsoyG83frY4"}}]}""");
        assertThat(MenuHintClient.placeId(withId)).isEqualTo("ChIJN1t_tDeuEmsRUsoyG83frY4");
        assertThat(MenuHintClient.placeId(new ObjectMapper().readTree("{\"groundingChunks\": [{\"maps\": {\"placeId\": \"../x\"}}]}"))).isNull();
    }

    @Test
    void 메뉴별_가격과_가격대를_읽음() {
        MenuHint h = MenuHintClient.parse("""
                STATUS: OPEN
                KIND: LUNCH
                MENU: 라멘 (ラーメン) 900 · 카레 (カレー) ¥1,100 · 교자(餃子)
                PRICE: LUNCH 800-1,200엔
                """, SRC, null);
        assertThat(h.menus()).containsExactly("라멘 (ラーメン) 900", "카레 (カレー) ¥1,100", "교자(餃子)");
        assertThat(h.price()).isEqualTo(new MenuHint.Price("lunch", 800, 1200));
        assertThat(MenuHintClient.price("ALL 1000-3000")).isEqualTo(new MenuHint.Price("all", 1000, 3000));
        assertThat(MenuHintClient.price("LUNCH 950")).isEqualTo(new MenuHint.Price("lunch", 950, 950));
        assertThat(MenuHintClient.price("UNKNOWN")).isNull();
        assertThat(MenuHintClient.price("LUNCH 1200-800")).isNull(); // 거꾸로
        assertThat(MenuHintClient.price("LUNCH 50")).isNull();
        // 구글 지도 출처가 없으면 가격도 쓰지 않음
        assertThat(MenuHintClient.parse("MENU: 라멘 (ラーメン) 900\nPRICE: LUNCH 800-1200", List.of(), null).price()).isNull();
    }

    @Test
    void 지도를_안_본_답은_AI_추측_영업_여부는_쓰지_않음() {
        MenuHint g = MenuHintClient.guess("STATUS: CLOSED\nKIND: LUNCH\nMENU: 라멘(ラーメン) · 교자(餃子)");
        assertThat(g).extracting(MenuHint::status, MenuHint::place, MenuHint::kind, MenuHint::placeId)
                .containsExactly("guess", "unknown", "lunch", null);
        assertThat(g.menus()).containsExactly("라멘(ラーメン)", "교자(餃子)");
        assertThat(g.sources()).isEmpty();
        assertThat(MenuHintClient.guess("STATUS: OPEN\nMENU: UNKNOWN").status()).isEqualTo("unknown");
        // AI 추측에는 가격을 붙이지 않음 (구글 지도에서 확인된 가격만)
        MenuHint priced = MenuHintClient.guess("MENU: 라멘 (ラーメン) 900 · 카레 (カレー) ¥1,100엔\nPRICE: LUNCH 800-1200");
        assertThat(priced.menus()).containsExactly("라멘 (ラーメン)", "카레 (カレー)");
        assertThat(priced.price()).isNull();
    }

    static final String GROUNDED = """
            {"candidates": [{"content": {"parts": [{"text": "STATUS: OPEN\\nMENU: 라멘(ラーメン)"}]},
              "groundingMetadata": {"groundingChunks": [{"maps": {"uri": "https://maps.google.com/?cid=1", "title": "A"}}]}}]}""";
    static final String UNGROUNDED = """
            {"candidates": [{"content": {"parts": [{"text": "STATUS: OPEN\\nMENU: 우동(うどん)"}]}}]}""";
    static final String UNGROUNDED_NO_MENU = """
            {"candidates": [{"content": {"parts": [{"text": "STATUS: OPEN\\nMENU: UNKNOWN"}]}}]}""";

    /** 정해 둔 답을 차례로 돌려주는 가짜 Gemini (문자열이면 답, 예외면 던짐) */
    static MenuHintClient fake(List<Object> answers, List<java.time.Duration> asked) {
        var it = answers.iterator();
        return new MenuHintClient(new ObjectMapper(), "key", "m", 20) {
            @Override
            com.fasterxml.jackson.databind.JsonNode call(Shop shop, String lang, java.time.Duration timeout) throws java.io.IOException {
                asked.add(timeout);
                Object next = it.next();
                if (next instanceof java.io.IOException e) throw e;
                return new ObjectMapper().readTree((String) next);
            }
        };
    }

    static final Shop SHOP = new Shop("J1", "北極星", 34.65, 135.43);

    @Test
    void 지도를_안_보고_답하면_자동으로_한_번_더_물음() {
        var asked = new java.util.ArrayList<java.time.Duration>();
        MenuHint h = fake(List.of(UNGROUNDED, GROUNDED), asked).ask(SHOP, "ko", () -> true);
        assertThat(h.status()).isEqualTo("ok");
        assertThat(h.menus()).containsExactly("라멘(ラーメン)");
        assertThat(asked).hasSize(2);
        assertThat(asked.get(1)).isLessThanOrEqualTo(java.time.Duration.ofSeconds(20)); // 남은 시간 안에서만
    }

    @Test
    void 다시_물어도_지도를_안_보면_메뉴가_있는_답을_AI_추측으로() {
        var asked = new java.util.ArrayList<java.time.Duration>();
        assertThat(fake(List.of(UNGROUNDED, UNGROUNDED_NO_MENU), asked).ask(SHOP, "ko", () -> true))
                .extracting(MenuHint::status, MenuHint::menus).containsExactly("guess", List.of("우동(うどん)"));
        // 하루 한도가 남지 않으면 다시 묻지 않고 첫 답으로
        var once = new java.util.ArrayList<java.time.Duration>();
        assertThat(fake(List.of(UNGROUNDED), once).ask(SHOP, "ko", () -> false).status()).isEqualTo("guess");
        assertThat(once).hasSize(1);
    }

    @Test
    void 지도에서_찾았는데_메뉴가_없으면_다시_묻지_않음() {
        var asked = new java.util.ArrayList<java.time.Duration>();
        String noMenu = GROUNDED.replace("MENU: 라멘(ラーメン)", "MENU: UNKNOWN");
        assertThat(fake(List.of(noMenu), asked).ask(SHOP, "ko", () -> true).status()).isEqualTo("unknown");
        assertThat(asked).hasSize(1);
    }

    @Test
    void 오류면_다시_묻고_시간_초과면_그만() {
        var asked = new java.util.ArrayList<java.time.Duration>();
        assertThat(fake(List.of(new java.io.IOException("Gemini 오류 503"), GROUNDED), asked).ask(SHOP, "ko", () -> true).status())
                .isEqualTo("ok");
        var timedOut = new java.util.ArrayList<java.time.Duration>();
        assertThat(fake(List.of(new java.net.http.HttpTimeoutException("느림")), timedOut).ask(SHOP, "ko", () -> true).status())
                .isEqualTo("unavailable");
        assertThat(timedOut).hasSize(1);
        var bothFail = new java.util.ArrayList<java.time.Duration>();
        assertThat(fake(List.of(new java.io.IOException("x"), new java.io.IOException("y")), bothFail).ask(SHOP, "ko", () -> true).status())
                .isEqualTo("unavailable");
    }

    @Test
    void 질문은_사용자_언어로() {
        String p = MenuHintClient.prompt(new Shop("J1", "北極星", 34.65, 135.43), "ja");
        assertThat(p).contains("Name: 北極星").contains("latitude 34.65").contains("Japanese (ja)");
    }
}
