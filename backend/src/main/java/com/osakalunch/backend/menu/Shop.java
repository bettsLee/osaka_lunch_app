package com.osakalunch.backend.menu;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;

/**
 * 핫페퍼 가게 (수집 배치가 채우는 shops 테이블). 서버는 대표 메뉴를 물을 이름 · 좌표만 읽고 고치지 않음
 */
@Entity
@Table(name = "shops")
@Immutable
public class Shop {

    @Id
    private String id;
    private String name;
    private Double lat;
    private Double lng;

    protected Shop() {
    }

    public Shop(String id, String name, Double lat, Double lng) {
        this.id = id;
        this.name = name;
        this.lat = lat;
        this.lng = lng;
    }

    public String getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public Double getLat() {
        return lat;
    }

    public Double getLng() {
        return lng;
    }
}
