import WidgetKit
import SwiftUI

/// 主屏小组件「今日黄历」：小号显示日期与宜，中号加上忌与干支。
/// 数据来自打包的 almanac.json（scripts/widget-data.mjs 生成），不需要 App Group，也不联网。
/// 轻点打开 laiganjue://m/almanac（中号右下「轻点抽今日一签」打开灵签）。
struct AlmanacEntry: TimelineEntry {
    let date: Date
    let day: AlmanacDay?
}

struct AlmanacProvider: TimelineProvider {
    func placeholder(in context: Context) -> AlmanacEntry {
        AlmanacEntry(date: Date(), day: .placeholder)
    }

    func getSnapshot(in context: Context, completion: @escaping (AlmanacEntry) -> Void) {
        let now = Date()
        completion(AlmanacEntry(date: now, day: AlmanacStore.day(for: now) ?? .placeholder))
    }

    /// 今天一条 + 之后 3 个午夜各一条，过完再刷新
    func getTimeline(in context: Context, completion: @escaping (Timeline<AlmanacEntry>) -> Void) {
        let cal = Calendar.current
        let now = Date()
        var entries = [AlmanacEntry(date: now, day: AlmanacStore.day(for: now))]
        var midnight = cal.startOfDay(for: now)
        for _ in 0..<3 {
            midnight = cal.date(byAdding: .day, value: 1, to: midnight) ?? midnight.addingTimeInterval(86_400)
            entries.append(AlmanacEntry(date: midnight, day: AlmanacStore.day(for: midnight)))
        }
        completion(Timeline(entries: entries, policy: .atEnd))
    }
}

struct AlmanacWidgetEntryView: View {
    @Environment(\.widgetFamily) private var family
    let entry: AlmanacEntry

    var body: some View {
        let size: WidgetSize = family == .systemMedium ? .medium : .small
        let view = AlmanacWidgetView(date: entry.date, day: entry.day, size: size)
            .widgetURL(URL(string: "laiganjue://m/almanac"))
        if #available(iOSApplicationExtension 17.0, *) {
            view.containerBackground(for: .widget) { WidgetSky() }
        } else {
            view.padding(12).background(WidgetSky())
        }
    }
}

@main
struct LaiganjueWidget: Widget {
    let kind = "LaiganjueAlmanac"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: AlmanacProvider()) { entry in
            AlmanacWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("今日黄历")
        .description("每天的农历、宜忌，轻点打开来感觉。")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
