// 在模拟器里自动截付费卡与皮肤单买卡，确认价格来自 StoreKit 的本地化字符串。
// StoreKitTest 加载 Products.storekit（店面中国），不连 App Store、不需要沙盒账号。
// 截图作为测试附件保存在 .xcresult 里，scripts/paywall-shot.sh 负责导出到 docs/claude-plan/screenshots/。
import XCTest
import StoreKitTest

final class PaywallScreenshotTests: XCTestCase {
    private var session: SKTestSession?
    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        let url = try XCTUnwrap(Bundle(for: Self.self).url(forResource: "Products", withExtension: "storekit"), "测试包里没有 Products.storekit")
        let s = try SKTestSession(contentsOf: url)
        s.resetToDefaultState()
        s.disableDialogs = true
        s.clearTransactions()
        session = s
        app = XCUIApplication()
        app.launch()
        // 等首页渲染完（WKWebView 里的标题会出现在无障碍树里）
        XCTAssertTrue(app.staticTexts["此刻，想问什么？"].waitForExistence(timeout: 60), "首页没有出现")
    }

    private func priceText() -> XCUIElement {
        app.descendants(matching: .any)
            .matching(NSPredicate(format: "label CONTAINS '¥' OR label CONTAINS '$' OR label CONTAINS '￥'"))
            .firstMatch
    }

    private func snap(_ name: String) {
        let shot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        shot.name = name
        shot.lifetime = .keepAlways
        add(shot)
    }

    private func dumpTree(_ name: String) {
        snap(name)
        let tree = XCTAttachment(string: app.debugDescription)
        tree.name = name + "-tree"
        tree.lifetime = .keepAlways
        add(tree)
    }

    func testPaywallShowsLocalizedPrices() throws {
        app.open(URL(string: "laiganjue://pro")!)
        let restore = app.buttons.matching(NSPredicate(format: "label CONTAINS '恢复购买'")).firstMatch
        let opened = restore.waitForExistence(timeout: 20)
        if !opened { dumpTree("paywall-debug") }
        XCTAssertTrue(opened, "付费卡没有打开")
        let priced = priceText().waitForExistence(timeout: 30)
        sleep(1) // 等抽屉滑入动画结束
        snap("paywall")
        if !priced { dumpTree("paywall-debug") }
        XCTAssertTrue(priced, "付费卡上没有本地化价格")
        let unavailable = app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS '暂不可用'")).firstMatch
        XCTAssertFalse(unavailable.exists, "有方案没拿到 StoreKit 产品")
    }

    func testSkinOfferShowsLocalizedPrice() throws {
        app.open(URL(string: "laiganjue://skin/nebula")!)
        let buy = app.buttons.matching(NSPredicate(format: "label CONTAINS '单买这套皮肤'")).firstMatch
        XCTAssertTrue(buy.waitForExistence(timeout: 20), "皮肤单买卡没有打开")
        let priced = app.buttons.matching(NSPredicate(format: "label CONTAINS '单买这套皮肤' AND (label CONTAINS '¥' OR label CONTAINS '$' OR label CONTAINS '￥')")).firstMatch
        XCTAssertTrue(priced.waitForExistence(timeout: 30), "单买按钮上没有本地化价格")
        sleep(1)
        snap("skin-offer")
    }
}
