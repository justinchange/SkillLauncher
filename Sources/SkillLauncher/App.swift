import SwiftUI
import AppKit
import HotKey
import Yams

// 简单日志
func log(_ msg: String) {
    let ts = ISO8601DateFormatter().string(from: Date())
    let line = "[\(ts)] \(msg)\n"
    print(line, terminator: "")
    let logFile = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Logs/SkillLauncher/app.log")
    try? FileManager.default.createDirectory(at: logFile.deletingLastPathComponent(), withIntermediateDirectories: true)
    if let data = line.data(using: .utf8), let handle = try? FileHandle(forWritingTo: logFile) {
        handle.seekToEndOfFile()
        handle.write(data)
        try? handle.close()
    } else {
        try? line.data(using: .utf8)?.write(to: logFile)
    }
}

// Claude 会话管理器（流式输出）
class ClaudeSession: ObservableObject {
    @Published var output: String = ""
    @Published var isRunning: Bool = false

    private var currentProcess: Process?

    private var claudePath: String? {
        let paths = [
            FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".local/bin/claude").path,
            "/opt/homebrew/bin/claude",
            "/usr/local/bin/claude"
        ]
        return paths.first(where: { FileManager.default.fileExists(atPath: $0) })
    }

    private var currentCommand: String = ""
    private var responseBuffer: String = ""

    func send(_ text: String) {
        guard let claude = claudePath else {
            let err = "❌ Claude CLI not found"
            output += err + "\n"
            log(err)
            return
        }

        guard !isRunning else {
            output += "⏳ 等待上一个命令完成...\n"
            return
        }

        // 记录发送
        currentCommand = text
        responseBuffer = ""
        log("发送: \(text)")

        // 显示输入
        output += "\n› \(text)\n"
        isRunning = true

        // 流式执行
        let task = Process()
        task.executableURL = URL(fileURLWithPath: claude)
        task.arguments = ["-p", text, "--output-format", "stream-json", "--verbose", "--include-partial-messages", "--dangerously-skip-permissions"]

        let pipe = Pipe()
        task.standardOutput = pipe
        task.standardError = pipe

        // 实时读取输出（解析 stream-json）
        pipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            guard !data.isEmpty else { return }

            if let str = String(data: data, encoding: .utf8) {
                // 按行解析 JSON
                for line in str.components(separatedBy: "\n") where !line.isEmpty {
                    if let text = self?.parseStreamJson(line) {
                        DispatchQueue.main.async {
                            self?.output += text
                            self?.responseBuffer += text
                        }
                    }
                }
            }
        }

        task.terminationHandler = { [weak self] proc in
            DispatchQueue.main.async {
                self?.isRunning = false
                self?.output += "\n"

                // 记录执行结果
                let exitCode = proc.terminationStatus
                let response = self?.responseBuffer.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                let preview = response.prefix(200)
                if exitCode == 0 {
                    log("完成: \(preview)\(response.count > 200 ? "..." : "")")
                } else {
                    log("失败 (exit \(exitCode)): \(preview)")
                }
            }
            pipe.fileHandleForReading.readabilityHandler = nil
        }

        do {
            try task.run()
            currentProcess = task
        } catch {
            let err = "❌ 启动失败: \(error.localizedDescription)"
            output += err + "\n"
            log(err)
            isRunning = false
        }
    }

    func stop() {
        currentProcess?.terminate()
        currentProcess = nil
        isRunning = false
        output += "\n[已停止]\n"
        log("已停止: \(currentCommand)")
    }

    func clear() {
        output = ""
    }

    // 解析 stream-json 格式
    private func parseStreamJson(_ line: String) -> String? {
        guard let data = line.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = json["type"] as? String else {
            return nil
        }

        switch type {
        case "stream_event":
            // 流式事件，从 event.delta.text 提取增量文本
            if let event = json["event"] as? [String: Any],
               let eventType = event["type"] as? String,
               eventType == "content_block_delta",
               let delta = event["delta"] as? [String: Any],
               let text = delta["text"] as? String {
                return text
            }
        default:
            return nil
        }
        return nil
    }
}

@main
struct App {
    static func main() {
        let app = NSApplication.shared
        let delegate = AppDelegate()
        app.delegate = delegate
        app.setActivationPolicy(.accessory)
        app.run()
    }
}

// 可接收键盘输入的 Panel
class KeyablePanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { true }
}

class AppDelegate: NSObject, NSApplicationDelegate {
    var hotKey: HotKey?
    var panel: NSPanel?
    var skills: [Skill] = []
    var recentSkills: [String] = []  // 最近使用
    let recentKey = "recentSkills"
    let session = ClaudeSession()  // 持久会话

    func applicationDidFinishLaunching(_ notification: Notification) {
        log("========== SkillLauncher 启动 ==========")

        skills = scanSkills()
        log("加载了 \(skills.count) 个 skills")

        // 读取最近使用
        recentSkills = UserDefaults.standard.stringArray(forKey: recentKey) ?? []

        // 全局快捷键 Option+Space
        hotKey = HotKey(key: .space, modifiers: [.option])
        hotKey?.keyDownHandler = { [weak self] in self?.togglePanel() }

        // 菜单栏
        let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        statusItem.button?.image = NSImage(systemSymbolName: "command", accessibilityDescription: nil)
        statusItem.button?.action = #selector(togglePanel)
        statusItem.button?.target = self
    }

    @objc func togglePanel() {
        if panel?.isVisible == true {
            panel?.close()
            return
        }
        showPanel()
    }

    func showPanel() {
        if panel == nil {
            panel = KeyablePanel(contentRect: NSRect(x: 0, y: 0, width: 680, height: 460),
                           styleMask: [.borderless],
                           backing: .buffered, defer: false)
            panel?.isFloatingPanel = true
            panel?.level = .floating
            panel?.isMovableByWindowBackground = true
            panel?.backgroundColor = .clear
            panel?.hasShadow = false  // 使用 SwiftUI 阴影
            panel?.hidesOnDeactivate = true
            panel?.becomesKeyOnlyIfNeeded = false
        }

        let view = LauncherView(
            skills: skills,
            recentSkills: recentSkills,
            session: session,
            close: { [weak self] in self?.panel?.close() },
            onExecute: { [weak self] skillName in self?.addRecent(skillName) }
        )
        panel?.contentView = NSHostingView(rootView: view)
        panel?.center()
        panel?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)

        // 查找并聚焦 TextField
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { [weak self] in
            if let contentView = self?.panel?.contentView {
                self?.focusTextField(in: contentView)
            }
        }
    }

    func focusTextField(in view: NSView) {
        if let tf = view as? NSTextField, tf.isEditable {
            panel?.makeFirstResponder(tf)
            // 光标移到末尾，不要全选
            DispatchQueue.main.async {
                if let editor = tf.currentEditor() {
                    editor.selectedRange = NSRange(location: editor.string.count, length: 0)
                }
            }
            return
        }
        for subview in view.subviews {
            focusTextField(in: subview)
        }
    }

    func addRecent(_ name: String) {
        recentSkills.removeAll { $0 == name }
        recentSkills.insert(name, at: 0)
        if recentSkills.count > 5 { recentSkills = Array(recentSkills.prefix(5)) }
        UserDefaults.standard.set(recentSkills, forKey: recentKey)
    }

    func scanSkills() -> [Skill] {
        let dir = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".claude/skills")
        guard let folders = try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: [.isDirectoryKey], options: [.skipsHiddenFiles]) else { return [] }

        return folders.compactMap { folder -> Skill? in
            guard (try? folder.resourceValues(forKeys: [.isDirectoryKey]))?.isDirectory == true else { return nil }
            let md = folder.appendingPathComponent("SKILL.md")
            guard let content = try? String(contentsOf: md, encoding: .utf8) else { return nil }

            let lines = content.components(separatedBy: "\n")
            guard lines.first == "---" else { return Skill(name: folder.lastPathComponent, desc: "") }

            var yaml = ""
            for line in lines.dropFirst() {
                if line == "---" { break }
                yaml += line + "\n"
            }

            if let data = try? Yams.load(yaml: yaml) as? [String: Any] {
                return Skill(name: data["name"] as? String ?? folder.lastPathComponent,
                           desc: data["description"] as? String ?? "")
            }
            return Skill(name: folder.lastPathComponent, desc: "")
        }.sorted { $0.name < $1.name }
    }
}

struct Skill: Identifiable, Equatable {
    let id = UUID()
    let name: String
    let desc: String
}

struct LauncherView: View {
    let skills: [Skill]
    let recentSkills: [String]
    @ObservedObject var session: ClaudeSession
    let close: () -> Void
    let onExecute: (String) -> Void

    @State private var input = "/"
    @State private var selected = 0
    @State private var showSkillList = true  // 是否显示 skill 列表（手动开关）

    private let accentColor = Color(red: 0.35, green: 0.45, blue: 0.95) // Raycast 紫蓝色

    // 计算属性：skill 列表是否可见
    // 输入 `/` 或 `/skill` → 显示（正在选择）
    // 输入 `/skill ` 有空格 → 隐藏（正在输入参数）
    var skillListVisible: Bool {
        showSkillList && input.hasPrefix("/") && !input.contains(" ") && !session.isRunning
    }

    var filtered: [Skill] {
        let q = input.hasPrefix("/") ? String(input.dropFirst()) : input
        let query = q.components(separatedBy: " ").first?.lowercased() ?? ""

        var result: [Skill]
        if query.isEmpty {
            result = skills
        } else {
            result = skills.filter { $0.name.lowercased().contains(query) || $0.desc.lowercased().contains(query) }
        }

        return result.sorted { a, b in
            let aIdx = recentSkills.firstIndex(of: a.name) ?? Int.max
            let bIdx = recentSkills.firstIndex(of: b.name) ?? Int.max
            if aIdx != bIdx { return aIdx < bIdx }
            return a.name < b.name
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            // 聊天记录区域（顶部）
            ScrollViewReader { proxy in
                ScrollView {
                    if session.output.isEmpty {
                        VStack(spacing: 8) {
                            Text("输入 / 查看可用 Skills")
                                .font(.system(size: 14))
                                .foregroundColor(.secondary)
                        }
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .padding(.top, 80)
                    } else {
                        Text(session.output)
                            .font(.system(size: 13, design: .monospaced))
                            .foregroundColor(.primary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(16)
                            .textSelection(.enabled)
                            .id("bottom")
                    }
                }
                .frame(height: skillListVisible && !filtered.isEmpty ? 180 : 340)
                .background(Color.gray.opacity(0.02))
                .onChange(of: session.output) { _, _ in
                    withAnimation {
                        proxy.scrollTo("bottom", anchor: .bottom)
                    }
                }
            }

            Rectangle()
                .fill(Color.gray.opacity(0.15))
                .frame(height: 1)

            // 输入栏
            HStack(spacing: 14) {
                Circle()
                    .fill(session.isRunning ? Color.green : Color.gray.opacity(0.3))
                    .frame(width: 8, height: 8)

                TextField("输入命令...", text: $input)
                    .textFieldStyle(.plain)
                    .font(.system(size: 18, weight: .light))
                    .foregroundColor(.primary)
                    .onSubmit { handleSubmit() }

                if session.isRunning {
                    ProgressView()
                        .scaleEffect(0.6)
                }

                if !input.isEmpty {
                    Button(action: { input = "/" }) {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundColor(Color.gray.opacity(0.6))
                            .font(.system(size: 16))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 12)

            // Skills 列表（输入框下方，自动补全）
            if skillListVisible && !filtered.isEmpty {
                Rectangle()
                    .fill(Color.gray.opacity(0.15))
                    .frame(height: 1)

                ScrollViewReader { proxy in
                    List(Array(filtered.enumerated()), id: \.1.id) { i, skill in
                        SkillRow(skill: skill, isSelected: i == selected, isRecent: recentSkills.contains(skill.name), accentColor: accentColor)
                            .id(skill.id)
                            .listRowInsets(EdgeInsets(top: 0, leading: 8, bottom: 0, trailing: 8))
                            .listRowBackground(Color.clear)
                            .listRowSeparator(.hidden)
                            .onTapGesture { selectSkill(skill, at: i) }
                    }
                    .listStyle(.plain)
                    .scrollContentBackground(.hidden)
                    .frame(height: 160)
                    .onChange(of: selected) { _, newValue in
                        if newValue < filtered.count {
                            withAnimation(.easeOut(duration: 0.15)) {
                                proxy.scrollTo(filtered[newValue].id, anchor: .center)
                            }
                        }
                    }
                }
            }

            // 快捷键提示栏（最底部）
            Rectangle()
                .fill(Color.gray.opacity(0.15))
                .frame(height: 1)

            HStack(spacing: 16) {
                // 会话控制
                if session.isRunning {
                    Button(action: { session.stop() }) {
                        Label("Stop", systemImage: "stop.fill")
                            .font(.system(size: 11))
                            .foregroundColor(.red)
                    }
                    .buttonStyle(.plain)
                }

                Button(action: { session.clear() }) {
                    Label("Clear", systemImage: "trash")
                        .font(.system(size: 11))
                        .foregroundColor(.secondary)
                }
                .buttonStyle(.plain)

                Button(action: { showSkillList.toggle() }) {
                    Label(showSkillList ? "Hide" : "Skills", systemImage: "list.bullet")
                        .font(.system(size: 11))
                        .foregroundColor(.secondary)
                }
                .buttonStyle(.plain)

                Spacer()

                ShortcutHint(keys: ["↵"], label: "Send")
                ShortcutHint(keys: ["esc"], label: "Close")
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
        }
        .frame(width: 680)
        .background(VisualEffectBlur(material: .popover, blendingMode: .behindWindow))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(Color.gray.opacity(0.2), lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.2), radius: 30, x: 0, y: 15)
        .onAppear { selected = 0 }
        .onKeyPress(.upArrow) { moveSelection(-1); return .handled }
        .onKeyPress(.downArrow) { moveSelection(1); return .handled }
        .onKeyPress(.tab) { autocomplete(); return .handled }
        .onKeyPress(.escape) { handleEscape(); return .handled }
    }

    func moveSelection(_ delta: Int) {
        let count = filtered.count
        guard count > 0 else { return }
        selected = (selected + delta + count) % count
    }

    func autocomplete() {
        guard selected < filtered.count else { return }
        let skill = filtered[selected]
        input = "/\(skill.name) "
    }

    func selectSkill(_ skill: Skill, at index: Int) {
        selected = index
        input = "/\(skill.name) "
    }

    func selectAndExecute(_ skill: Skill) {
        input = "/\(skill.name) "
        // 如果已经有参数，直接执行
        execute()
    }

    func handleSubmit() {
        // 如果只输入了 skill 名（无空格后的参数），先补全
        let trimmed = input.trimmingCharacters(in: .whitespaces)
        if !trimmed.contains(" ") && !filtered.isEmpty {
            autocomplete()
            return
        }
        execute()
    }

    func handleEscape() {
        if input != "/" {
            input = "/"
        } else {
            close()
        }
    }

    func execute() {
        let cmd = input.trimmingCharacters(in: .whitespaces)
        guard !cmd.isEmpty else { return }

        // 提取 skill 名
        let skillName = cmd.hasPrefix("/") ? String(cmd.dropFirst().split(separator: " ").first ?? "") : ""
        if !skillName.isEmpty { onExecute(skillName) }

        log("发送: \(cmd)")

        // 使用持久会话发送
        session.send(cmd)

        // 发送后清空输入，保留 /
        input = "/"
    }
}

// Raycast 风格的列表行
struct SkillRow: View {
    let skill: Skill
    let isSelected: Bool
    let isRecent: Bool
    let accentColor: Color

    var body: some View {
        HStack(spacing: 14) {
            // 图标
            Text(iconFor(skill))
                .font(.system(size: 22))
                .frame(width: 36, height: 36)
                .background(
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .fill(isSelected ? accentColor.opacity(0.15) : Color.gray.opacity(0.1))
                )

            // 标题和描述
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 8) {
                    Text(skill.name)
                        .font(.system(size: 14, weight: isSelected ? .semibold : .medium))
                        .foregroundColor(.primary)

                    if isRecent {
                        Text("Recent")
                            .font(.system(size: 10, weight: .medium))
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color.orange.opacity(0.15))
                            .foregroundColor(.orange)
                            .cornerRadius(4)
                    }
                }

                if !skill.desc.isEmpty {
                    Text(skill.desc)
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                }
            }

            Spacer()

            // 快捷键提示
            if isSelected {
                Text("↵")
                    .font(.system(size: 11, weight: .medium, design: .rounded))
                    .foregroundColor(.secondary)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 3)
                    .background(Color.gray.opacity(0.12))
                    .cornerRadius(4)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(isSelected ? accentColor.opacity(0.1) : Color.clear)
        )
        .contentShape(Rectangle())
    }

    func iconFor(_ skill: Skill) -> String {
        let text = (skill.name + skill.desc).lowercased()
        if text.contains("image") || text.contains("图") || text.contains("画") { return "🎨" }
        if text.contains("todo") || text.contains("待办") { return "✅" }
        if text.contains("doc") || text.contains("文档") { return "📄" }
        if text.contains("ssh") || text.contains("remote") || text.contains("mini") { return "🖥️" }
        if text.contains("sync") || text.contains("同步") { return "🔄" }
        if text.contains("port") || text.contains("端口") { return "🔌" }
        if text.contains("ppt") || text.contains("演示") { return "📊" }
        if text.contains("think") || text.contains("思考") || text.contains("mind") { return "🧠" }
        if text.contains("publish") || text.contains("发布") { return "📤" }
        if text.contains("create") || text.contains("创建") { return "✨" }
        if text.contains("design") || text.contains("设计") || text.contains("前端") { return "🎯" }
        return "⚡"
    }
}

// 快捷键提示组件
struct ShortcutHint: View {
    let keys: [String]
    let label: String

    var body: some View {
        HStack(spacing: 4) {
            ForEach(keys, id: \.self) { key in
                Text(key)
                    .font(.system(size: 10, weight: .medium, design: .rounded))
                    .foregroundColor(.secondary)
                    .padding(.horizontal, 5)
                    .padding(.vertical, 3)
                    .background(Color.gray.opacity(0.12))
                    .cornerRadius(4)
            }
            Text(label)
                .font(.system(size: 11))
                .foregroundColor(Color.gray)
        }
    }
}

struct VisualEffectBlur: NSViewRepresentable {
    var material: NSVisualEffectView.Material = .hudWindow
    var blendingMode: NSVisualEffectView.BlendingMode = .behindWindow

    func makeNSView(context: Context) -> NSVisualEffectView {
        let view = NSVisualEffectView()
        view.material = material
        view.blendingMode = blendingMode
        view.state = .active
        return view
    }
    func updateNSView(_ nsView: NSVisualEffectView, context: Context) {
        nsView.material = material
        nsView.blendingMode = blendingMode
    }
}

