import UIKit
import XCTest
@testable import Dispo

final class AvatarImagePipelineTests: XCTestCase {
    override func tearDown() {
        AvatarURLProtocolStub.reset()
        super.tearDown()
    }

    func testCoalescesConcurrentLoadsAndKeepsDecodedImageInMemory() async throws {
        AvatarURLProtocolStub.configure([
            .init(statusCode: 200, data: makeImageData(), delay: 0.08)
        ])
        let pipeline = makePipeline()
        let url = try XCTUnwrap(URL(string: "https://example.test/avatar.jpg?v=one"))

        async let first = pipeline.image(for: url, subscriber: UUID())
        async let second = pipeline.image(for: url, subscriber: UUID())
        _ = try await (first, second)

        XCTAssertEqual(AvatarURLProtocolStub.requestCount, 1)

        _ = try await pipeline.image(for: url, subscriber: UUID())
        XCTAssertEqual(AvatarURLProtocolStub.requestCount, 1)
    }

    func testRetriesTransientServerFailureThenLoadsImage() async throws {
        AvatarURLProtocolStub.configure([
            .init(statusCode: 503, data: Data()),
            .init(statusCode: 200, data: makeImageData())
        ])
        let pipeline = makePipeline()
        let url = try XCTUnwrap(URL(string: "https://example.test/avatar.jpg?v=retry"))

        _ = try await pipeline.image(for: url, subscriber: UUID())

        XCTAssertEqual(AvatarURLProtocolStub.requestCount, 2)
    }

    func testDoesNotRetryPermanentNotFoundResponse() async throws {
        AvatarURLProtocolStub.configure([
            .init(statusCode: 404, data: Data())
        ])
        let pipeline = makePipeline()
        let url = try XCTUnwrap(URL(string: "https://example.test/missing.jpg"))

        do {
            _ = try await pipeline.image(for: url, subscriber: UUID())
            XCTFail("Le chargement aurait dû échouer.")
        } catch let error as AvatarImagePipelineError {
            XCTAssertEqual(error, .httpStatus(404))
        }

        XCTAssertEqual(AvatarURLProtocolStub.requestCount, 1)
    }

    func testCancelsTransferWhenLastSubscriberDisappears() async throws {
        AvatarURLProtocolStub.configure([
            .init(statusCode: 200, data: makeImageData(), delay: 2)
        ])
        let pipeline = makePipeline()
        let url = try XCTUnwrap(URL(string: "https://example.test/avatar.jpg?v=cancel"))
        let subscriber = UUID()
        let load = Task {
            try await pipeline.image(for: url, subscriber: subscriber)
        }

        try await Task.sleep(nanoseconds: 30_000_000)
        await pipeline.cancel(url: url, subscriber: subscriber)

        do {
            _ = try await load.value
            XCTFail("Le transfert aurait dû être annulé.")
        } catch is CancellationError {
            // Résultat attendu.
        } catch let error as URLError {
            XCTAssertEqual(error.code, .cancelled)
        }
        XCTAssertEqual(AvatarURLProtocolStub.requestCount, 1)
    }

    private func makePipeline() -> AvatarImagePipeline {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [AvatarURLProtocolStub.self]
        configuration.urlCache = nil
        return AvatarImagePipeline(
            session: URLSession(configuration: configuration),
            retryDelaysNanoseconds: [0, 0, 0]
        )
    }

    private func makeImageData() -> Data {
        UIGraphicsImageRenderer(size: CGSize(width: 12, height: 12)).pngData { context in
            UIColor.systemBlue.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 12, height: 12))
        }
    }
}

private final class AvatarURLProtocolStub: URLProtocol {
    struct StubResponse {
        let statusCode: Int
        let data: Data
        var delay: TimeInterval = 0
    }

    private static let lock = NSLock()
    private static var responses: [StubResponse] = []
    private static var storedRequestCount = 0
    private var deliveryWorkItem: DispatchWorkItem?

    static var requestCount: Int {
        lock.withLock { storedRequestCount }
    }

    static func configure(_ responses: [StubResponse]) {
        lock.withLock {
            self.responses = responses
            storedRequestCount = 0
        }
    }

    static func reset() {
        lock.withLock {
            responses = []
            storedRequestCount = 0
        }
    }

    override class func canInit(with request: URLRequest) -> Bool { true }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        let stub = Self.lock.withLock { () -> StubResponse in
            Self.storedRequestCount += 1
            guard !Self.responses.isEmpty else {
                return StubResponse(statusCode: 500, data: Data())
            }
            return Self.responses.removeFirst()
        }

        let delivery = DispatchWorkItem { [weak self] in
            guard let self, let url = request.url else { return }
            let response = HTTPURLResponse(
                url: url,
                statusCode: stub.statusCode,
                httpVersion: "HTTP/1.1",
                headerFields: ["Content-Type": "image/png"]
            )!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: stub.data)
            client?.urlProtocolDidFinishLoading(self)
        }
        deliveryWorkItem = delivery

        if stub.delay > 0 {
            DispatchQueue.global().asyncAfter(deadline: .now() + stub.delay, execute: delivery)
        } else {
            delivery.perform()
        }
    }

    override func stopLoading() {
        deliveryWorkItem?.cancel()
        deliveryWorkItem = nil
    }
}
