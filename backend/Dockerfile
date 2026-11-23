# 11/23: Java4Shell(CVE-2026-114938)이 고쳐진 Temurin 17.0.21.1+2로 고정 (태그를 고정해야 예전 이미지 캐시를 다시 쓰지 않음)
# 빌드 스테이지
FROM eclipse-temurin:17.0.21.1_2-jdk-alpine AS builder
WORKDIR /app
COPY gradlew .
COPY gradle gradle
COPY build.gradle .
COPY settings.gradle .
COPY src src
RUN chmod +x gradlew && ./gradlew bootJar -x test --no-daemon

# 실행 스테이지
FROM eclipse-temurin:17.0.21.1_2-jre-alpine
WORKDIR /app
COPY --from=builder /app/build/libs/*.jar app.jar
EXPOSE 8080
# 11/18~23에는 -XX:-UseBASE64Intrinsics로 Java4Shell을 임시로 막았음 → 패치 빌드로 바꿔서 옵션을 뺌 (11/18 상권 결정: 패치가 나오면 빼기)
ENTRYPOINT ["java", "-jar", "app.jar"]
