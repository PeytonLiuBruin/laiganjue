import SwiftUI

/// 小组件配色：与 visual-direction.md 第 2、4 节一致（晴天蓝底、白卡厚度边、红 / 玉绿标签、深墨字）
enum WidgetPalette {
    static let skyTop = Color(red: 0x5a / 255, green: 0xb8 / 255, blue: 0xff / 255)
    static let skyBottom = Color(red: 0xb4 / 255, green: 0xe3 / 255, blue: 0xff / 255)
    static let ink = Color(red: 0x2b / 255, green: 0x22 / 255, blue: 0x40 / 255)
    static let inkSoft = Color(red: 0x6b / 255, green: 0x65 / 255, blue: 0x85 / 255)
    static let red = Color(red: 0xe8 / 255, green: 0x46 / 255, blue: 0x3c / 255)
    static let redDeep = Color(red: 0xb8 / 255, green: 0x30 / 255, blue: 0x2a / 255)
    static let jade = Color(red: 0x3f / 255, green: 0xcf / 255, blue: 0x8e / 255)
    static let jadeDeep = Color(red: 0x24 / 255, green: 0x9a / 255, blue: 0x66 / 255)
    static let gold = Color(red: 0xff / 255, green: 0xc9 / 255, blue: 0x3c / 255)
    static let edge = Color(red: 0x2b / 255, green: 0x22 / 255, blue: 0x40 / 255).opacity(0.14)
}

enum WidgetSize { case small, medium }

/// 圆头标签：「宜」「忌」小圆章，底部一条深一档的厚度边
struct TagBadge: View {
    let text: String
    let fill: Color
    let deep: Color
    var body: some View {
        Text(text)
            .font(.system(size: 12, weight: .heavy, design: .rounded))
            .foregroundColor(.white)
            .frame(width: 22, height: 22)
            .background(Circle().fill(fill))
            .background(Circle().fill(deep).offset(y: 2))
    }
}

struct TagLine: View {
    let badge: String
    let items: [String]
    let fill: Color
    let deep: Color
    let limit: Int
    var body: some View {
        HStack(spacing: 6) {
            TagBadge(text: badge, fill: fill, deep: deep)
            Text(items.isEmpty ? "诸事随缘" : items.prefix(limit).joined(separator: " · "))
                .font(.system(size: 13, weight: .bold, design: .rounded))
                .foregroundColor(WidgetPalette.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.75)
        }
    }
}

/// 白卡 + 底部 4pt 厚度边
struct ChunkyCard<Content: View>: View {
    let content: Content
    init(@ViewBuilder content: () -> Content) { self.content = content() }
    var body: some View {
        content
            .padding(10)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Color.white))
            .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(WidgetPalette.edge).offset(y: 4))
    }
}

struct AlmanacWidgetView: View {
    let date: Date
    let day: AlmanacDay?
    let size: WidgetSize
    /// Mac 上的预览渲染器画不出 Link，预览时传 false
    var linkable = true

    private var qianButton: some View {
        Text("抽今日一签 ›")
            .font(.system(size: 11, weight: .heavy, design: .rounded))
            .foregroundColor(.white)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(Capsule().fill(WidgetPalette.red))
            .background(Capsule().fill(WidgetPalette.redDeep).offset(y: 2))
    }

    private var dayNumber: String {
        String(Calendar.current.component(.day, from: date))
    }
    private var monthText: String {
        "\(Calendar.current.component(.month, from: date))月"
    }

    var body: some View {
        switch size {
        case .small: small
        case .medium: medium
        }
    }

    private var header: some View {
        HStack(spacing: 4) {
            Circle().fill(WidgetPalette.gold).frame(width: 8, height: 8)
                .overlay(Circle().stroke(WidgetPalette.ink.opacity(0.5), lineWidth: 1))
            Text("来感觉 · 今日黄历")
                .font(.system(size: 11, weight: .heavy, design: .rounded))
                .foregroundColor(.white)
                .shadow(color: WidgetPalette.ink.opacity(0.35), radius: 0, x: 0, y: 1)
        }
    }

    private var dateBlock: some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text(dayNumber)
                .font(.system(size: 40, weight: .black, design: .rounded))
                .foregroundColor(WidgetPalette.red)
                .shadow(color: WidgetPalette.redDeep.opacity(0.9), radius: 0, x: 0, y: 2)
            VStack(alignment: .leading, spacing: 1) {
                Text("\(monthText) · \(day?.w ?? "")")
                    .font(.system(size: 12, weight: .heavy, design: .rounded))
                    .foregroundColor(WidgetPalette.ink)
                Text(day.map { $0.t.isEmpty ? "农历\($0.l)" : "\($0.l) · \($0.t)" } ?? "")
                    .font(.system(size: 11, weight: .semibold, design: .rounded))
                    .foregroundColor(WidgetPalette.inkSoft)
            }
            .lineLimit(1)
            .minimumScaleFactor(0.7)
        }
    }

    private var small: some View {
        VStack(alignment: .leading, spacing: 6) {
            header
            ChunkyCard {
                VStack(alignment: .leading, spacing: 6) {
                    dateBlock
                    Spacer(minLength: 0)
                    if let day = day {
                        TagLine(badge: "宜", items: day.y, fill: WidgetPalette.red, deep: WidgetPalette.redDeep, limit: 2)
                    } else {
                        Text("打开来感觉看今日黄历")
                            .font(.system(size: 12, weight: .bold, design: .rounded))
                            .foregroundColor(WidgetPalette.inkSoft)
                    }
                }
            }
        }
    }

    private var medium: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                header
                Spacer()
                if let day = day {
                    Text("\(day.g) · 属\(day.z)")
                        .font(.system(size: 11, weight: .bold, design: .rounded))
                        .foregroundColor(.white.opacity(0.92))
                        .lineLimit(1)
                }
            }
            ChunkyCard {
                HStack(alignment: .top, spacing: 12) {
                    VStack(alignment: .leading, spacing: 4) {
                        dateBlock
                        Spacer(minLength: 0)
                        if linkable {
                            Link(destination: URL(string: "laiganjue://m/qian")!) { qianButton }
                        } else {
                            qianButton
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    VStack(alignment: .leading, spacing: 10) {
                        if let day = day {
                            TagLine(badge: "宜", items: day.y, fill: WidgetPalette.red, deep: WidgetPalette.redDeep, limit: 3)
                            TagLine(badge: "忌", items: day.j, fill: WidgetPalette.jade, deep: WidgetPalette.jadeDeep, limit: 3)
                        } else {
                            Text("打开来感觉看今日黄历")
                                .font(.system(size: 12, weight: .bold, design: .rounded))
                                .foregroundColor(WidgetPalette.inkSoft)
                        }
                    }
                    .padding(.top, 6)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
    }
}

/// 小组件背景：晴天蓝渐变
struct WidgetSky: View {
    var body: some View {
        LinearGradient(colors: [WidgetPalette.skyTop, WidgetPalette.skyBottom], startPoint: .top, endPoint: .bottom)
    }
}
