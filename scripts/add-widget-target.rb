# 给 ios/App/App.xcodeproj 加上主屏小组件扩展目标 LaiganjueWidget，并嵌入 App。重复运行不会重复添加。
# 依赖 xcodeproj gem（CocoaPods 自带）。用法：
#   GEM_HOME=$(ls -d /opt/homebrew/Cellar/cocoapods/*/libexec | tail -1) ruby scripts/add-widget-target.rb
require 'xcodeproj'

root = File.expand_path('..', __dir__)
project_path = File.join(root, 'ios/App/App.xcodeproj')
project = Xcodeproj::Project.open(project_path)

NAME = 'LaiganjueWidget'
app = project.targets.find { |t| t.name == 'App' } or abort '找不到 App 目标'
if project.targets.any? { |t| t.name == NAME }
  puts "#{NAME} 已存在，跳过"
  exit 0
end

widget = project.new_target(:app_extension, NAME, :ios, '15.0', nil, :swift)

group = project.main_group.find_subpath(NAME, true)
group.set_source_tree('<group>')
group.set_path(NAME)
%w[LaiganjueWidget.swift AlmanacData.swift AlmanacWidgetView.swift].each do |f|
  widget.add_file_references([group.new_reference(f)])
end
json = group.new_reference('almanac.json')
widget.add_resources([json])
group.new_reference('Info.plist')

%w[WidgetKit SwiftUI].each do |fw|
  ref = project.frameworks_group.new_file("System/Library/Frameworks/#{fw}.framework", :sdk_root)
  widget.frameworks_build_phase.add_file_reference(ref, true)
end

app_bundle_id = app.build_configurations.first.build_settings['PRODUCT_BUNDLE_IDENTIFIER']
widget.build_configurations.each do |c|
  s = c.build_settings
  s['PRODUCT_BUNDLE_IDENTIFIER'] = "#{app_bundle_id}.widget"
  s['INFOPLIST_FILE'] = "#{NAME}/Info.plist"
  s['PRODUCT_NAME'] = '$(TARGET_NAME)'
  s['SWIFT_VERSION'] = '5.0'
  s['IPHONEOS_DEPLOYMENT_TARGET'] = '15.0'
  s['TARGETED_DEVICE_FAMILY'] = '1,2'
  s['MARKETING_VERSION'] = '1.0'
  s['CURRENT_PROJECT_VERSION'] = '1'
  s['CODE_SIGN_STYLE'] = 'Automatic'
  s['SKIP_INSTALL'] = 'YES'
  s['GENERATE_INFOPLIST_FILE'] = 'NO'
  s['LD_RUNPATH_SEARCH_PATHS'] = ['$(inherited)', '@executable_path/Frameworks', '@executable_path/../../Frameworks']
  team = app.build_configurations.find { |a| a.name == c.name }&.build_settings&.dig('DEVELOPMENT_TEAM')
  s['DEVELOPMENT_TEAM'] = team if team
end

app.add_dependency(widget)
embed = app.copy_files_build_phases.find { |p| p.name == 'Embed Foundation Extensions' } ||
        app.new_copy_files_build_phase('Embed Foundation Extensions')
embed.symbol_dst_subfolder_spec = :plug_ins
bf = embed.add_file_reference(widget.product_reference, true)
bf.settings = { 'ATTRIBUTES' => ['RemoveHeadersOnCopy'] }

project.save
puts "已添加 #{NAME}（#{app_bundle_id}.widget）并嵌入 App"
