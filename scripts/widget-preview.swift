// 在 Mac 上把主屏小组件画成 PNG 过目（不需要模拟器）：
//   swiftc -parse-as-library -o /tmp/lgj-widget-preview scripts/widget-preview.swift \
//     ios/App/LaiganjueWidget/AlmanacWidgetView.swift ios/App/LaiganjueWidget/AlmanacData.swift
//   /tmp/lgj-widget-preview ios/App/LaiganjueWidget/almanac.json docs/claude-plan/screenshots
// 小号 170×170、中号 364×170（iPhone 16/17 Pro 的点尺寸），3 倍图。
import SwiftUI
import AppKit

@main
struct WidgetPreview {
    @MainActor static func render<V: View>(_ view: V, size: CGSize, to url: URL) {
        let framed = view
            .padding(14)
            .frame(width: size.width, height: size.height)
            .background(WidgetSky())
            .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
            .environment(\.colorScheme, .light)
        let r = ImageRenderer(content: framed)
        r.scale = 3
        guard let img = r.nsImage, let tiff = img.tiffRepresentation,
              let rep = NSBitmapImageRep(data: tiff), let png = rep.representation(using: .png, properties: [:]) else {
            print("渲染失败", url.lastPathComponent); return
        }
        try? png.write(to: url)
        print("写入", url.path)
    }

    @MainActor static func main() {
        let args = CommandLine.arguments
        let json = URL(fileURLWithPath: args.count > 1 ? args[1] : "ios/App/LaiganjueWidget/almanac.json")
        let out = URL(fileURLWithPath: args.count > 2 ? args[2] : ".")
        struct F: Codable { let days: [String: AlmanacDay] }
        let days = (try? JSONDecoder().decode(F.self, from: Data(contentsOf: json)))?.days ?? [:]
        let now = Date()
        let day = days[AlmanacStore.key(for: now)]
        render(AlmanacWidgetView(date: now, day: day, size: .small), size: CGSize(width: 170, height: 170), to: out.appendingPathComponent("widget-small.png"))
        render(AlmanacWidgetView(date: now, day: day, size: .medium, linkable: false), size: CGSize(width: 364, height: 170), to: out.appendingPathComponent("widget-medium.png"))
        // 表外日期的兜底样式
        render(AlmanacWidgetView(date: now, day: nil, size: .medium, linkable: false), size: CGSize(width: 364, height: 170), to: out.appendingPathComponent("widget-medium-fallback.png"))
        // 锁屏三种尺寸：在深色壁纸上用白字模拟系统着色，矩形 172×76、圆形 76×76、时间上方一行 260×22
        renderLock(day: day, name: "lock", out: out)
        // 字数最多的一天（宜忌各 4 项都是长词），检查是否截断
        if let longest = days.max(by: { ($0.value.y.prefix(3).joined().count + $0.value.j.prefix(3).joined().count) < ($1.value.y.prefix(3).joined().count + $1.value.j.prefix(3).joined().count) }) {
            print("最长一天", longest.key)
            render(AlmanacWidgetView(date: now, day: longest.value, size: .medium, linkable: false), size: CGSize(width: 364, height: 170), to: out.appendingPathComponent("widget-medium-longest.png"))
            render(AlmanacWidgetView(date: now, day: longest.value, size: .small), size: CGSize(width: 170, height: 170), to: out.appendingPathComponent("widget-small-longest.png"))
            renderLock(day: longest.value, name: "lock-longest", out: out)
        }
        // 节气日与闰月各取一天，检查锁屏圆形的拆字
        if let term = days.sorted(by: { $0.key < $1.key }).first(where: { !$0.value.t.isEmpty && $0.key >= AlmanacStore.key(for: now) }) {
            print("节气日", term.key, term.value.t)
            renderLock(day: term.value, name: "lock-term", out: out)
        }
        if let leap = days.first(where: { $0.value.l.hasPrefix("闰") }) {
            print("闰月", leap.key, leap.value.l)
            renderLock(day: leap.value, name: "lock-leap", out: out)
        }
        renderLock(day: nil, name: "lock-fallback", out: out)
    }

    /// 三种锁屏尺寸拼成一张：深色壁纸 + 白字，圆形垫一层半透明底（模拟 AccessoryWidgetBackground）
    @MainActor static func renderLock(day: AlmanacDay?, name: String, out: URL) {
        let sheet = VStack(alignment: .leading, spacing: 14) {
            AlmanacLockView(day: day, size: .inline)
                .font(.system(size: 15, weight: .semibold, design: .rounded))
                .frame(width: 260, height: 22, alignment: .center)
                .border(Color.white.opacity(0.15))
            HStack(spacing: 14) {
                AlmanacLockView(day: day, size: .circular)
                    .frame(width: 76, height: 76)
                    .background(Circle().fill(Color.white.opacity(0.18)))
                AlmanacLockView(day: day, size: .rectangular)
                    .frame(width: 172, height: 76)
                    .border(Color.white.opacity(0.15))
            }
        }
        .foregroundStyle(.white)
        .padding(18)
        .background(LinearGradient(colors: [Color(red: 0.16, green: 0.2, blue: 0.36), Color(red: 0.35, green: 0.22, blue: 0.42)], startPoint: .top, endPoint: .bottom))
        .environment(\.colorScheme, .dark)
        let r = ImageRenderer(content: sheet)
        r.scale = 3
        guard let img = r.nsImage, let tiff = img.tiffRepresentation,
              let rep = NSBitmapImageRep(data: tiff), let png = rep.representation(using: .png, properties: [:]) else {
            print("渲染失败", name); return
        }
        let url = out.appendingPathComponent("widget-\(name).png")
        try? png.write(to: url)
        print("写入", url.path)
    }
}
