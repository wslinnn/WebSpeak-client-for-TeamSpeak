/** 移动端语音壳底部导航的分区。状态权威在 use-inroom-controllers（useState），
 *  chat-controller 在非 chat 分区时暂停滚动跟随——类型因此落 web-client 层，
 *  组件与控制器同向依赖，不形成 shell↔workspace 编译期环。 */
export type MobileSection = "channels" | "chat" | "voice" | "more";
