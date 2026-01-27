// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "SkillLauncher",
    platforms: [
        .macOS(.v14)
    ],
    dependencies: [
        .package(url: "https://github.com/soffes/HotKey.git", from: "0.2.0"),
        .package(url: "https://github.com/jpsim/Yams.git", from: "5.0.0")
    ],
    targets: [
        .executableTarget(
            name: "SkillLauncher",
            dependencies: ["HotKey", "Yams"],
            path: "Sources/SkillLauncher"
        )
    ]
)
