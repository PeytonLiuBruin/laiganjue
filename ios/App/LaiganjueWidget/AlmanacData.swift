import Foundation

/// 一天的黄历条目（由 scripts/widget-data.mjs 用 App 内同一套农历库预先算好）
struct AlmanacDay: Codable, Equatable {
    let l: String      // 农历：九月十五
    let g: String      // 干支：丙午年 辛未日
    let z: String      // 生肖
    let w: String      // 星期六
    let y: [String]    // 宜
    let j: [String]    // 忌
    let t: String      // 节气或节日，可为空

    static let placeholder = AlmanacDay(l: "九月十五", g: "丙午年 辛未日", z: "马", w: "星期六",
                                        y: ["祭祀", "移徙", "会亲友"], j: ["嫁娶", "开市"], t: "")
}

private struct AlmanacFile: Codable {
    let v: Int
    let days: [String: AlmanacDay]
}

enum AlmanacStore {
    private static var cache: [String: AlmanacDay]?

    static func key(for date: Date, calendar: Calendar = .current) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    /// 查不到（表外日期或文件缺失）时返回 nil，界面显示「打开来感觉看今日黄历」
    static func day(for date: Date, bundle: Bundle = .main) -> AlmanacDay? {
        if cache == nil {
            guard let url = bundle.url(forResource: "almanac", withExtension: "json"),
                  let data = try? Data(contentsOf: url),
                  let file = try? JSONDecoder().decode(AlmanacFile.self, from: data) else { return nil }
            cache = file.days
        }
        return cache?[key(for: date)]
    }
}
