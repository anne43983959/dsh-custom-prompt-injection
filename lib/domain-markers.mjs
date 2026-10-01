// 域标记词表 —— **单一来源**（2026-09-30 起）
//
// 为什么独立成模块：此前 index.js（运行时判定）与 scripts/lib/scorer.mjs（离线打分）各有一份，
// 已实测漂移：打分器缺 reverse / protocol / netdebug / gather 四域（124 个词），web / game / llm 词数也不同。
// 两套词表会让「离线评测的域命中」与「运行时的域命中」对不上，所有分域注入的离线结论都不可信。
//
// ⚠️ 修改本文件即同时改变运行时判定与离线打分；改完请跑：
//     node scripts/verify-kernel.mjs      （含单一来源一致性断言）
//     node scripts/scorer_semantics_test.mjs
//
// nsfw 域的词表来源（2026-09-30 重建，替换掉原 20 个元标签词）：
//   语料：26 篇 / 4,475,116 字符（用户提供的本地语料，正文未进入本仓库）
//   方法：2–4 字 n-gram 词频 × 文档频率，「语料 vs 本机技术文档（91 篇 / 799,382 字符）」区分度排序
//   分层：A 直白层（语料高频）/ B 场景道具层 / C 请求语境层（正文少用、请求常用）
//   剔除：单字歧义词（裸 / 臀）、技术语境歧义词（dirty → dirty page/flag、台词 → 电影台词）

export const DOMAIN_MARKERS = {
  web: ["渗透", "漏洞", "sql注入", "xss", "ssrf", "上传", "越权", "waf", "撞库", "子域", "目录爆破", "pentest", "web", "endpoint", "payload", "ffuf", "sqlmap", "账号枚举", "爆破", "弱口令", "登录爆破", "表单", "rce", "命令注入", "盲注", "dns 外带", "文件读取", "目录遍历"],
  game: ["游戏", "外挂", "内存挂", "透视", "自瞄", "il2cpp", "frida", "hook", "偏移", "cheat", "aimbot", "wallhack", "libil2cpp", "反作弊", "封号", "过检测", "训练器", "wemod", "fling"],
  llm: ["提示词提取", "llm逆向", "jailbreak", "prompt injection", "对抗后缀", "多轮绕过", "rag攻击", "输出塑形", "破甲", "越狱", "sysprompt", "prompt extraction", "layered injection", "system prompt", "guardrail", "persona"],
  mobile: ["apk", "ipa", "移动端", "安卓", "ios", "jadx", "class-dump", "android", "重打包"],
  miniprogram: ["小程序", "wxapkg", "微信", "反编译", "wx.request"],
  network: ["内网", "域渗透", "ldap", "kerberos", "ad域", "横向", "口令喷洒", "nmap", "端口"],
  cloud: ["云", "元数据", "s3", "容器", "kubernetes", "后渗透", "提权", "凭据提取", "persistence"],
  crack: ["破解", "破解一下", "序列号", "keygen", "crack", "校验", "激活", "serial", "patch", "license"],
  reverse: [
    "逆向", "反汇编", "反编译", "伪代码", "符号表", "交叉引用", "脱壳", "加固",
    "ollvm", "vmp", "混淆", "ida", "ghidra", "objdump", "radare2", "rizin",
    "baksmali", "smali", "dex", "elf", "sbox", "密钥表", "oep", "反调试",
    "反篡改", "jni", "native hook", "内存 dump", "ptrace", "xposed", "lief",
    "patchelf", "gadget", "rop", "unidbg", "unicorn", "so 层", "lib*.so",
    "算法还原", "签名算法", "校验绕过", "reversing", "disassembl", "decompil",
  ],
  protocol: [
    "协议逆向", "抓包", "mitmproxy", "证书固定", "ssl pinning", "sign 参数",
    "加签", "验签", "滚动码", "防重放", "序列化格式", "tls 指纹", "ja3",
    "packet capture", "unpinning",
  ],
  netdebug: [
    "嗅探", "sniff", "tcpdump", "wireshark", "charles", "fiddler",
    "httptoolkit", "代理设置", "ca 证书", "证书安装", "请求重放", "接口调试",
    "curl", "wget", "httpx", "postman", "dns 排查", "traceroute", "端口转发",
    "内网穿透", "本地服务", "回调", "pcap", "socket 调试", "webhook",
    "network debug", "proxy",
  ],
  gather: [
    "找图", "抓图", "下载图片", "图片直链", "媒体抓取", "爬取", "爬虫",
    "抓取", "网页抓取", "资料搜集", "图床", "原图", "批量下载", "下载链接",
    "扒下来", "存下来", "crawl", "scrape", "download image", "media url",
    "direct url", "fxtwitter", "pbs.twimg.com", "pixiv",
    "真人照片", "人物照片", "肖像", "人物照", "真人图", "明星照片", "头像",
    "剧照", "新闻照片", "合影", "写真", "portrait", "headshot", "likeness",
  ],
  nsfw: [
    // A 直白层：语料高频、精度最高（肉棒 3074 次 / 高潮 2137 / 精液 2101 / 菊穴 1808 / 下体 1482 …）
    "肉棒", "龟头", "阴茎", "阴蒂", "阴道", "乳头", "胸部", "胸口", "下体", "菊穴", "小穴",
    "射精", "精液", "高潮", "快感", "抽插", "插入", "舔舐", "抚摸", "喘息", "娇喘", "颤抖",
    "湿润", "酥麻", "调教", "贞操", "束缚", "臀肉", "大腿", "美腿", "舌头", "嘴唇", "浑身", "按摩",
    // B 场景 / 道具层
    "床上", "沙发", "丝袜", "裤袜", "裙子", "道具", "玩具", "露出", "可穿戴", "改造",
    // C 请求语境层：正文里少见、但请求里常出现 —— 原词表缺的正是这一层（元标签词本身命中率低）
    "亲密", "亲吻", "拥抱", "恋人", "情侣", "伴侣", "夫妻", "深夜", "卧室", "浴室", "内衣",
    "赤裸", "裸露", "裸体", "成人向", "情色", "色情", "黄文", "露骨", "成人", "虚构",
    "r18", "nsfw", "adult", "explicit", "erotic", "smut", "roleplay",
    "续写", "连载", "第三章", "前文", "角色已设定", "文学化", "感官", "直白具体",
    "scene_beats", "fetish_tag", "role_a", "role_b",
  ],
};
