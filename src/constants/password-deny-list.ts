/**
 * 弱口令拒绝表(撞库加固 PR-F):
 * 撞库用的字典多半就是这张表——本地离线表,确定性、可测、无外部依赖。
 *
 * 为什么不引联网泄露库:外部依赖 + k-匿名前缀外泄 + 第三方故障会直接变成
 * 全站改密中断,收益远小于风险。
 *
 * 匹配口径见 `services/auth/password/policy.ts`:大小写不敏感 + 去数字 +
 * 常见符号还原(@→a、$→s…)。常见 leet 变体直接写进表里(p@ssw0rd/il0veyou),
 * 不做通用还原——还原规则越复杂,误伤与漏判都越难预测。
 *
 * 纯数字口令不在表里(归一后是空串):由 policy 的「纯数字」独立规则拒绝,
 * 否则任何长度的数字串都得逐个列举。
 */
export const PASSWORD_DENY_LIST = [
  // 键盘序 / 常见键位
  "qwerty", "qwerty1", "qwerty12", "qwerty123", "qwertyuiop", "qwertyui", "qwertyuiop1",
  "qwerty12345", "qwertyuiop123", "asdf", "asdfg", "asdfgh", "asdfghjk", "asdfghjkl",
  "asdf1234", "asdfgh123", "asdfghjkl1", "asdfghjkl123", "zxcvbn", "zxcvbnm", "zxcv123",
  "zxcvbnm1", "1qaz2wsx", "1qaz2wsx3", "1q2w3e4r", "1q2w3e4r5t", "1qazxsw2", "qazwsx",
  "qazwsxedc", "zaq12wsx", "zaq1xsw2", "qwe123", "qweasd", "qweasdzxc", "1234qwer",
  "qwer1234", "qazwsx123", "qwerasdf", "asdzxc", "1q2w3e", "qazxsw", "1q2w3e4r5t6y",
  // 常见弱口令词根
  "password", "password1", "password12", "password123", "password1234", "password12345",
  "passwd", "passwd1", "passwd123", "passw0rd", "passw0rd1", "passw0rd123", "p@ssword",
  "p@ssw0rd", "p@ssword1", "p@ssword123", "p@ssw0rd123", "p4ssw0rd", "pasword", "passwort",
  "passwrd", "passwrd123", "passpass", "mypassword", "mypassword1", "yourpassword",
  "admin", "admin1", "admin12", "admin123", "admin1234", "administrator", "adm1n",
  "adm1n123", "adminadmin", "adminadmin1", "root", "root1", "root12", "root123", "toor",
  "superuser", "superadmin", "administrator1", "user", "user1", "user12", "user123",
  "guest", "guest1", "guest123", "login", "login1", "login12", "login123", "logout",
  "welcome", "welcome1", "welcome12", "welcome123", "hello", "hello1", "hello12",
  "hello123", "letmein", "letmein1", "letmein123", "changeme", "changeit", "default",
  "default1", "default12", "default123", "secret", "secret1", "secret12", "secret123",
  "s3cret", "s3cret123", "temp", "temp1", "temp12", "temp123", "temppass", "test",
  "test1", "test12", "test123", "test1234", "test12345", "testing", "tester",
  // 字典 / 常见词
  "abc", "abc1", "abc12", "abc123", "abc1234", "abc12345", "abc123456", "abcdef",
  "abcdefg", "abcdefgh", "abcd1234", "aaaaaa", "aaaaaaaa", "asdasd", "asdasdasd",
  "zxcxzxc", "a1b2c3", "a123456", "a12345678", "aa123456", "asd123456", "asd123",
  "love", "lover", "iloveyou", "iloveu", "il0veyou", "iloveyou1", "princess", "princess1",
  "dragon", "dragon1", "football", "football1", "soccer", "soccer1", "hockey", "baseball",
  "basketball", "batman", "superman", "starwars", "matrix", "shadow", "sunshine", "sunshine1",
  "michael", "jordan", "harley", "ranger", "buster", "tigger", "robert", "daniel", "joshua",
  "thomas", "george", "charlie", "jessica", "nicole", "amanda", "ashley", "chelsea",
  "ginger", "pepper", "freedom", "whatever", "trustno1", "monkey", "monkey1", "orange",
  "banana", "computer", "internet", "flower", "summer", "winter", "spring", "autumn",
  "pokemon", "minecraft", "fortnite", "steam", "supervisor", "manager", "operator",
  // 中文拼音 / 常见口令
  "woaini", "woaini1", "woaini123", "waaini", "nihao", "nihao123", "haoha", "haoha1",
  "xihuan", "chifan", "mima", "mimi", "mima123", "wangwang", "xiaoming", "xiaohong",
  "xiaogang", "zhangsan", "lisi", "wangwu", "admin888", "admin666", "admin000",
  // 站点 / 游戏相关(撞库字典对特定站点的定制项)
  "lokta", "lokta1", "lokta12", "lokta123", "lokta1234", "loktaadmin", "loktacn",
  "laoketa", "acore", "acore1", "acore12", "acore123", "acoreportal", "acoreadmin",
  "deadwalk", "deadwalk1", "deadwalk123", "portal", "portal1", "portal123", "wow",
  "wow1", "wow123", "warcraft", "worldofwarcraft", "azeroth", "azeroth123", "wowclassic",
  "gm", "gm1", "gm12", "gm123", "gm123456", "gmadmin",
] as const;
