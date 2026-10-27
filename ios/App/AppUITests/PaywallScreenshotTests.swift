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

    // —— 购买与恢复（disableDialogs 下 StoreKitTest 直接确认购买，不弹系统面板）——

    private func label(_ text: String) -> XCUIElement {
        app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", text)).firstMatch
    }

    /// 等到界面上没有任何文字包含 text 的按钮（抽屉关闭后 420 毫秒才从 DOM 移除）。
    private func waitGone(_ text: String, timeout: TimeInterval) -> Bool {
        let q = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", text))
        let end = Date().addingTimeInterval(timeout)
        while Date() < end {
            if q.count == 0 { return true }
            usleep(500_000)
        }
        return q.count == 0
    }

    private func openPaywallWithPrices() {
        app.open(URL(string: "laiganjue://pro")!)
        XCTAssertTrue(priceText().waitForExistence(timeout: 30), "付费卡上没有本地化价格")
        sleep(1)
    }

    /// 试用年度 → 提示欢迎并关闭付费卡 → 再打开付费卡点恢复购买，能恢复 Pro。
    func testYearlyTrialPurchaseThenRestore() throws {
        openPaywallWithPrices()
        let trial = app.buttons.matching(NSPredicate(format: "label CONTAINS '免费试用'")).firstMatch
        XCTAssertTrue(trial.waitForExistence(timeout: 10), "没有「免费试用」主按钮")
        trial.tap()
        let welcome = label("欢迎加入来感觉 Pro")
        let ok = welcome.waitForExistence(timeout: 30)
        snap("purchase-pro")
        if !ok { dumpTree("purchase-debug") }
        XCTAssertTrue(ok, "购买后没有提示欢迎加入")
        let restore = app.buttons.matching(NSPredicate(format: "label CONTAINS '恢复购买'")).firstMatch
        let gone = waitGone("恢复购买", timeout: 15)
        if !gone { dumpTree("purchase-close-debug") }
        XCTAssertTrue(gone, "购买成功后付费卡应关闭")
        XCTAssertEqual(session?.allTransactions().count, 1, "StoreKitTest 里应有 1 笔交易")

        sleep(2) // 等欢迎提示消失，避免和恢复提示混淆
        openPaywallWithPrices()
        XCTAssertTrue(restore.waitForExistence(timeout: 10))
        restore.tap()
        let restored = label("已恢复来感觉 Pro").waitForExistence(timeout: 30)
        snap("restore-pro")
        if !restored { dumpTree("restore-debug") }
        XCTAssertTrue(restored, "恢复购买没有找回 Pro")
    }

    /// 没有任何交易时点恢复购买，提示没有记录且付费卡不关闭。
    func testRestoreWithoutPurchases() throws {
        openPaywallWithPrices()
        let restore = app.buttons.matching(NSPredicate(format: "label CONTAINS '恢复购买'")).firstMatch
        restore.tap()
        // 三种结果都等，看到哪条就断言哪条，方便区分「恢复失败」和「没找到」
        let any = app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS '没有找到可恢复的购买' OR label CONTAINS '恢复失败' OR label CONTAINS '已恢复来感觉 Pro'")).firstMatch
        let shown = any.waitForExistence(timeout: 45) // 恢复超时是 20 秒
        snap("restore-none")
        if !shown { dumpTree("restore-none-debug") }
        XCTAssertTrue(shown, "点恢复购买后没有任何提示")
        XCTAssertTrue(any.label.contains("没有找到可恢复的购买"), "没有交易时应提示没有找到可恢复的购买，实际是：\(any.label)")
        XCTAssertTrue(restore.exists, "没有找到购买时付费卡不应关闭")
    }

    /// 单买星穹皮肤 → 提示已解锁并关闭单买卡。
    func testSkinPurchase() throws {
        app.open(URL(string: "laiganjue://skin/nebula")!)
        let buy = app.buttons.matching(NSPredicate(format: "label CONTAINS '单买这套皮肤' AND (label CONTAINS '¥' OR label CONTAINS '$' OR label CONTAINS '￥')")).firstMatch
        XCTAssertTrue(buy.waitForExistence(timeout: 30), "单买按钮上没有本地化价格")
        sleep(1)
        buy.tap()
        let ok = label("已解锁「星穹」").waitForExistence(timeout: 30)
        sleep(1)
        snap("skin-bought")
        if !ok { dumpTree("skin-buy-debug") }
        XCTAssertTrue(ok, "单买皮肤后没有提示已解锁")
        XCTAssertEqual(session?.allTransactions().count, 1, "StoreKitTest 里应有 1 笔交易")
    }
}
