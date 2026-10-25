# 给 ios/App/App.xcodeproj 加上 UI 测试目标 AppUITests，用来在模拟器里自动截付费卡与皮肤单买卡的本地化价格。
# 测试里用 StoreKitTest 加载 App/Products.storekit，不连 App Store、不需要沙盒账号。重复运行不会重复添加。
# 用法：
#   GEM_HOME=~/.lgj-gems GEM_PATH=~/.lgj-gems ruby scripts/add-uitest-target.rb
# （本机 CocoaPods 自带的 gem 缺 nkf 跑不起来，xcodeproj 单独装在 ~/.lgj-gems）
# 之后用 scripts/paywall-shot.sh 跑测试并导出截图。
require 'xcodeproj'

root = File.expand_path('..', __dir__)
project_path = File.join(root, 'ios/App/App.xcodeproj')
project = Xcodeproj::Project.open(project_path)

NAME = 'AppUITests'
app = project.targets.find { |t| t.name == 'App' } or abort '找不到 App 目标'
if project.targets.any? { |t| t.name == NAME }
  puts "#{NAME} 已存在，跳过"
  exit 0
end

ui = project.new_target(:ui_test_bundle, NAME, :ios, '16.4', nil, :swift)

group = project.main_group.find_subpath(NAME, true)
group.set_source_tree('<group>')
group.set_path(NAME)
ui.add_file_references([group.new_reference('PaywallScreenshotTests.swift')])

# StoreKit 配置文件作为测试包资源，供 SKTestSession(contentsOf:) 读取
app_group = project.main_group.find_subpath('App', false)
storekit = app_group&.files&.find { |f| f.path.to_s.end_with?('Products.storekit') }
storekit ||= app_group.new_reference('Products.storekit') if app_group
abort '找不到 App/Products.storekit' unless storekit
ui.add_resources([storekit])

%w[StoreKitTest].each do |fw|
  ref = project.frameworks_group.new_file("System/Library/Frameworks/#{fw}.framework", :sdk_root)
  ui.frameworks_build_phase.add_file_reference(ref, true)
end

app_bundle_id = app.build_configurations.first.build_settings['PRODUCT_BUNDLE_IDENTIFIER']
ui.build_configurations.each do |c|
  s = c.build_settings
  s['PRODUCT_BUNDLE_IDENTIFIER'] = "#{app_bundle_id}.uitests"
  s['PRODUCT_NAME'] = '$(TARGET_NAME)'
  s['SWIFT_VERSION'] = '5.0'
  s['IPHONEOS_DEPLOYMENT_TARGET'] = '16.4'
  s['TARGETED_DEVICE_FAMILY'] = '1,2'
  s['TEST_TARGET_NAME'] = 'App'
  s['GENERATE_INFOPLIST_FILE'] = 'YES'
  s['CODE_SIGN_STYLE'] = 'Automatic'
  s['MARKETING_VERSION'] = '1.0'
  s['CURRENT_PROJECT_VERSION'] = '1'
  team = app.build_configurations.find { |a| a.name == c.name }&.build_settings&.dig('DEVELOPMENT_TEAM')
  s['DEVELOPMENT_TEAM'] = team if team
end
ui.add_dependency(app)

project.save
puts "已添加 #{NAME}（#{app_bundle_id}.uitests）"
