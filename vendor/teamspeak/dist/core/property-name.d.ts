/**
 * The properties a TeamSpeak server reports, by name: the keys of the records
 * `getServerInfo`, `getInstanceInfo`, `getHostInfo` and `getClientProperties` return,
 * and of the settings `editServer` and `editInstance` take:
 *
 * ```ts
 * const info = await getServerInfo(client);
 * console.log(info[PropertyName.VirtualServerName]);
 * ```
 *
 * They are grouped by the command that reports them, and a property that
 * several report is listed under the first. These are the names measured on
 * TeamSpeak 3.13 and 6; the ones marked TeamSpeak 3 only or TeamSpeak 6 only
 * are missing on the other. A server may send keys this table does not name.
 */
declare const propertyNameValues: {
    /** `virtualserver_unique_identifier`: The server's unique id, a base64 string that stays the same when the server moves. */
    readonly VirtualServerUniqueIdentifier: "virtualserver_unique_identifier";
    /** `virtualserver_name`: The name of the virtual server. Editable. */
    readonly VirtualServerName: "virtualserver_name";
    /** `virtualserver_welcomemessage`: The welcome message of the server. Editable. */
    readonly VirtualServerWelcomeMessage: "virtualserver_welcomemessage";
    /** `virtualserver_platform`: Operating system the server runs on, such as Linux. */
    readonly VirtualServerPlatform: "virtualserver_platform";
    /** `virtualserver_version`: Server version and build, for example 3.13.8 [Build: 1779874471]. */
    readonly VirtualServerVersion: "virtualserver_version";
    /** `virtualserver_maxclients`: The maximum number of clients to allow. Editable. */
    readonly VirtualServerMaxClients: "virtualserver_maxclients";
    /** `virtualserver_password`: The password required to enter. Editable. */
    readonly VirtualServerPassword: "virtualserver_password";
    /** `virtualserver_clientsonline`: Number of clients online, voice and ServerQuery clients together. */
    readonly VirtualServerClientsOnline: "virtualserver_clientsonline";
    /** `virtualserver_channelsonline`: Number of channels on the server. */
    readonly VirtualServerChannelsOnline: "virtualserver_channelsonline";
    /** `virtualserver_created`: When the virtual server was created, as a Unix timestamp in seconds. */
    readonly VirtualServerCreated: "virtualserver_created";
    /** `virtualserver_uptime`: Seconds since the virtual server started. */
    readonly VirtualServerUptime: "virtualserver_uptime";
    /** `virtualserver_codec_encryption_mode`: The global codec encryption mode of the virtual server; see `CodecEncryptionMode`. Editable. */
    readonly VirtualServerCodecEncryptionMode: "virtualserver_codec_encryption_mode";
    /** `virtualserver_hostmessage`: The host message of the server. Editable. */
    readonly VirtualServerHostMessage: "virtualserver_hostmessage";
    /** `virtualserver_hostmessage_mode`: The host message mode of the server (0 for None, 1 for message in chatlog, 2 for message as a modal, 3 for modal dialog and then quit). Editable. */
    readonly VirtualServerHostMessageMode: "virtualserver_hostmessage_mode";
    /** `virtualserver_filebase`: Path of the server's file storage, relative to the server's working directory. */
    readonly VirtualServerFileBase: "virtualserver_filebase";
    /** `virtualserver_default_server_group`: The default server group to use. Editable. */
    readonly VirtualServerDefaultServerGroup: "virtualserver_default_server_group";
    /** `virtualserver_default_channel_group`: The default channel group to use. Editable. */
    readonly VirtualServerDefaultChannelGroup: "virtualserver_default_channel_group";
    /** `virtualserver_flag_password`: 1 if the server has a password, 0 if it does not. */
    readonly VirtualServerFlagPassword: "virtualserver_flag_password";
    /** `virtualserver_default_channel_admin_group`: The default channel administrator group to use. Editable. */
    readonly VirtualServerDefaultChannelAdminGroup: "virtualserver_default_channel_admin_group";
    /** `virtualserver_max_download_total_bandwidth`: The max bandwidth for outgoing file transfers on the virtual server (Bytes/s). Editable. */
    readonly VirtualServerMaxDownloadTotalBandwidth: "virtualserver_max_download_total_bandwidth";
    /** `virtualserver_max_upload_total_bandwidth`: The max bandwidth for incoming file transfers on the virtual server (Bytes/s). Editable. */
    readonly VirtualServerMaxUploadTotalBandwidth: "virtualserver_max_upload_total_bandwidth";
    /** `virtualserver_hostbanner_url`: URL for the host banner. Editable. */
    readonly VirtualServerHostBannerURL: "virtualserver_hostbanner_url";
    /** `virtualserver_hostbanner_gfx_url`: URL for the host banner image. Editable. */
    readonly VirtualServerHostBannerGFXURL: "virtualserver_hostbanner_gfx_url";
    /** `virtualserver_hostbanner_gfx_interval`: Refresh time for the host banner image on the client side (in seconds). Editable. */
    readonly VirtualServerHostBannerGFXInterval: "virtualserver_hostbanner_gfx_interval";
    /** `virtualserver_complain_autoban_count`: The number of complaints about a client we will tolerate before a ban. Editable. */
    readonly VirtualServerComplainAutoBanCount: "virtualserver_complain_autoban_count";
    /** `virtualserver_complain_autoban_time`: The amount of time (in seconds) an autobanned client will be banned for. Editable. */
    readonly VirtualServerComplainAutoBanTime: "virtualserver_complain_autoban_time";
    /** `virtualserver_complain_remove_time`: The amount of time (in seconds) before a complaint is deleted automatically. Editable. */
    readonly VirtualServerComplainRemoveTime: "virtualserver_complain_remove_time";
    /** `virtualserver_min_clients_in_channel_before_forced_silence`: Number of clients in the same channel needed to force silence. Editable. */
    readonly VirtualServerMinClientsInChannelBeforeForcedSilence: "virtualserver_min_clients_in_channel_before_forced_silence";
    /** `virtualserver_priority_speaker_dimm_modificator`: Client volume lowered automatically while a priority speaker is talking. Editable. */
    readonly VirtualServerPrioritySpeakerDimmModificator: "virtualserver_priority_speaker_dimm_modificator";
    /** `virtualserver_id`: The virtual server's id, as used by use sid=. */
    readonly VirtualServerID: "virtualserver_id";
    /** `virtualserver_antiflood_points_tick_reduce`: Anti-flood points removed from a client for being good. Editable. */
    readonly VirtualServerAntiFloodPointsTickReduce: "virtualserver_antiflood_points_tick_reduce";
    /** `virtualserver_antiflood_points_needed_command_block`: Anti-flood points needed to block commands being executed by the client. Editable. */
    readonly VirtualServerAntiFloodPointsNeededCommandBlock: "virtualserver_antiflood_points_needed_command_block";
    /** `virtualserver_antiflood_points_needed_ip_block`: Anti-flood points needed to block incoming connections from the client. Editable. */
    readonly VirtualServerAntiFloodPointsNeededIPBlock: "virtualserver_antiflood_points_needed_ip_block";
    /** `virtualserver_client_connections`: Number of voice client connections made since the server started. */
    readonly VirtualServerClientConnections: "virtualserver_client_connections";
    /** `virtualserver_query_client_connections`: Number of ServerQuery connections made since the server started. */
    readonly VirtualServerQueryClientConnections: "virtualserver_query_client_connections";
    /** `virtualserver_hostbutton_tooltip`: Text used for the tooltip of the host button on client-side. Editable. */
    readonly VirtualServerHostButtonTooltip: "virtualserver_hostbutton_tooltip";
    /** `virtualserver_hostbutton_url`: URL opened on click on the host button. Editable. */
    readonly VirtualServerHostButtonURL: "virtualserver_hostbutton_url";
    /** `virtualserver_hostbutton_gfx_url`: URL for the host button on client-side. Editable. */
    readonly VirtualServerHostButtonGFXURL: "virtualserver_hostbutton_gfx_url";
    /** `virtualserver_queryclientsonline`: Number of ServerQuery clients online. */
    readonly VirtualServerQueryClientsOnline: "virtualserver_queryclientsonline";
    /** `virtualserver_download_quota`: Download quota for the virtual server (MByte). Editable. */
    readonly VirtualServerDownloadQuota: "virtualserver_download_quota";
    /** `virtualserver_upload_quota`: Upload quota for the virtual server (MByte). Editable. */
    readonly VirtualServerUploadQuota: "virtualserver_upload_quota";
    /** `virtualserver_month_bytes_downloaded`: Bytes of file transfer downloads this month. */
    readonly VirtualServerMonthBytesDownloaded: "virtualserver_month_bytes_downloaded";
    /** `virtualserver_month_bytes_uploaded`: Bytes of file transfer uploads this month. */
    readonly VirtualServerMonthBytesUploaded: "virtualserver_month_bytes_uploaded";
    /** `virtualserver_total_bytes_downloaded`: Bytes of file transfer downloads in total. */
    readonly VirtualServerTotalBytesDownloaded: "virtualserver_total_bytes_downloaded";
    /** `virtualserver_total_bytes_uploaded`: Bytes of file transfer uploads in total. */
    readonly VirtualServerTotalBytesUploaded: "virtualserver_total_bytes_uploaded";
    /** `virtualserver_port`: UDP port the virtual server is listening on. Editable. */
    readonly VirtualServerPort: "virtualserver_port";
    /** `virtualserver_autostart`: 1 if started automatically with the instance, or 0 otherwise. Editable. */
    readonly VirtualServerAutoStart: "virtualserver_autostart";
    /** `virtualserver_machine_id`: Machine id that tells servers on one machine apart when they share a database; empty if unset. */
    readonly VirtualServerMachineID: "virtualserver_machine_id";
    /** `virtualserver_needed_identity_security_level`: Minimum client identity security level required to connect to the virtual server. Editable. */
    readonly VirtualServerNeededIdentitySecurityLevel: "virtualserver_needed_identity_security_level";
    /** `virtualserver_log_client`: Indicates whether the server logs events related to clients or not. Editable. */
    readonly VirtualServerLogClient: "virtualserver_log_client";
    /** `virtualserver_log_query`: Indicates whether the server logs events related to ServerQuery clients or not. Editable. */
    readonly VirtualServerLogQuery: "virtualserver_log_query";
    /** `virtualserver_log_channel`: Indicates whether the server logs events related to channels or not. Editable. */
    readonly VirtualServerLogChannel: "virtualserver_log_channel";
    /** `virtualserver_log_permissions`: Indicates whether the server logs events related to permissions or not. Editable. */
    readonly VirtualServerLogPermissions: "virtualserver_log_permissions";
    /** `virtualserver_log_server`: Indicates whether the server logs events related to server changes or not. Editable. */
    readonly VirtualServerLogServer: "virtualserver_log_server";
    /** `virtualserver_log_filetransfer`: Indicates whether the server logs events related to file transfers or not. Editable. */
    readonly VirtualServerLogFileTransfer: "virtualserver_log_filetransfer";
    /** `virtualserver_min_client_version`: Minimal desktop client version required to connect (a build number). Editable. */
    readonly VirtualServerMinClientVersion: "virtualserver_min_client_version";
    /** `virtualserver_name_phonetic`: Phonetic name of the virtual server. Editable. */
    readonly VirtualServerNamePhonetic: "virtualserver_name_phonetic";
    /** `virtualserver_icon_id`: CRC32 checksum of the virtual server icon. Editable. */
    readonly VirtualServerIconID: "virtualserver_icon_id";
    /** `virtualserver_reserved_slots`: Number of reserved slots available on the virtual server. Editable. */
    readonly VirtualServerReservedSlots: "virtualserver_reserved_slots";
    /** `virtualserver_total_packetloss_speech`: Average packet loss of voice packets, as a fraction between 0 and 1. */
    readonly VirtualServerTotalPacketLossSpeech: "virtualserver_total_packetloss_speech";
    /** `virtualserver_total_packetloss_keepalive`: Average packet loss of keepalive packets, as a fraction between 0 and 1. */
    readonly VirtualServerTotalPacketLossKeepAlive: "virtualserver_total_packetloss_keepalive";
    /** `virtualserver_total_packetloss_control`: Average packet loss of control packets, as a fraction between 0 and 1. */
    readonly VirtualServerTotalPacketLossControl: "virtualserver_total_packetloss_control";
    /** `virtualserver_total_packetloss_total`: Average packet loss over all packets, as a fraction between 0 and 1. */
    readonly VirtualServerTotalPacketLossTotal: "virtualserver_total_packetloss_total";
    /** `virtualserver_total_ping`: Average ping of all clients, in milliseconds. */
    readonly VirtualServerTotalPing: "virtualserver_total_ping";
    /** `virtualserver_ip`: IP addresses the virtual server listens on, separated by commas. */
    readonly VirtualServerIP: "virtualserver_ip";
    /** `virtualserver_weblist_enabled`: Indicates whether the server appears in the global web server list or not. Editable. */
    readonly VirtualServerWebListEnabled: "virtualserver_weblist_enabled";
    /** `virtualserver_ask_for_privilegekey`: 1 if clients are asked for a privilege key on their first connection to an unclaimed server, 0 if not. */
    readonly VirtualServerAskForPrivilegeKey: "virtualserver_ask_for_privilegekey";
    /** `virtualserver_hostbanner_mode`: The display mode for the virtual servers hostbanner; see `BannerMode`. Editable. */
    readonly VirtualServerHostBannerMode: "virtualserver_hostbanner_mode";
    /** `virtualserver_channel_temp_delete_delay_default`: Default delay, in seconds, before an empty temporary channel is deleted. */
    readonly VirtualServerChannelTempDeleteDelayDefault: "virtualserver_channel_temp_delete_delay_default";
    /** `virtualserver_min_android_version`: Minimal Android client version required to connect. Editable. */
    readonly VirtualServerMinAndroidVersion: "virtualserver_min_android_version";
    /** `virtualserver_min_ios_version`: Minimal iOS client version required to connect. Editable. */
    readonly VirtualServerMinIOSVersion: "virtualserver_min_ios_version";
    /** `virtualserver_nickname`: Nickname the server uses when it speaks, for example in server messages; empty uses the default. */
    readonly VirtualServerNickname: "virtualserver_nickname";
    /** `virtualserver_antiflood_points_needed_plugin_block`: Anti-flood points needed to block plugin commands from the client; if set to 0, the same as virtualserver_antiflood_points_needed_command_block is used. Editable. */
    readonly VirtualServerAntiFloodPointsNeededPluginBlock: "virtualserver_antiflood_points_needed_plugin_block";
    /** `virtualserver_capability_extensions`: Optional protocol features the server supports, separated by commas. */
    readonly VirtualServerCapabilityExtensions: "virtualserver_capability_extensions";
    /** `virtualserver_file_storage_class`: Storage backend of the server's files; empty for the local disk. TeamSpeak 3 only. */
    readonly VirtualServerFileStorageClass: "virtualserver_file_storage_class";
    /** `virtualserver_status`: Status of the virtual server (online | online virtual | offline | booting up | shutting down); see `VirtualServerStatus`. Editable. */
    readonly VirtualServerStatus: "virtualserver_status";
    /** `connection_filetransfer_bandwidth_sent`: Current file transfer upload speed, in bytes per second. Also in hostinfo and clientinfo. */
    readonly ConnectionFileTransferBandwidthSent: "connection_filetransfer_bandwidth_sent";
    /** `connection_filetransfer_bandwidth_received`: Current file transfer download speed, in bytes per second. Also in hostinfo and clientinfo. */
    readonly ConnectionFileTransferBandwidthReceived: "connection_filetransfer_bandwidth_received";
    /** `connection_filetransfer_bytes_sent_total`: Total bytes sent by file transfers since the server started. Also in hostinfo. */
    readonly ConnectionFileTransferBytesSentTotal: "connection_filetransfer_bytes_sent_total";
    /** `connection_filetransfer_bytes_received_total`: Total bytes received by file transfers since the server started. Also in hostinfo. */
    readonly ConnectionFileTransferBytesReceivedTotal: "connection_filetransfer_bytes_received_total";
    /** `connection_packets_sent_speech`: Voice packets sent since the server started. */
    readonly ConnectionPacketsSentSpeech: "connection_packets_sent_speech";
    /** `connection_bytes_sent_speech`: Bytes of voice packets sent since the server started. */
    readonly ConnectionBytesSentSpeech: "connection_bytes_sent_speech";
    /** `connection_packets_received_speech`: Voice packets received since the server started. */
    readonly ConnectionPacketsReceivedSpeech: "connection_packets_received_speech";
    /** `connection_bytes_received_speech`: Bytes of voice packets received since the server started. */
    readonly ConnectionBytesReceivedSpeech: "connection_bytes_received_speech";
    /** `connection_packets_sent_keepalive`: Keepalive packets sent since the server started. */
    readonly ConnectionPacketsSentKeepAlive: "connection_packets_sent_keepalive";
    /** `connection_bytes_sent_keepalive`: Bytes of keepalive packets sent since the server started. */
    readonly ConnectionBytesSentKeepAlive: "connection_bytes_sent_keepalive";
    /** `connection_packets_received_keepalive`: Keepalive packets received since the server started. */
    readonly ConnectionPacketsReceivedKeepAlive: "connection_packets_received_keepalive";
    /** `connection_bytes_received_keepalive`: Bytes of keepalive packets received since the server started. */
    readonly ConnectionBytesReceivedKeepAlive: "connection_bytes_received_keepalive";
    /** `connection_packets_sent_control`: Control (command) packets sent since the server started. */
    readonly ConnectionPacketsSentControl: "connection_packets_sent_control";
    /** `connection_bytes_sent_control`: Bytes of control packets sent since the server started. */
    readonly ConnectionBytesSentControl: "connection_bytes_sent_control";
    /** `connection_packets_received_control`: Control packets received since the server started. */
    readonly ConnectionPacketsReceivedControl: "connection_packets_received_control";
    /** `connection_bytes_received_control`: Bytes of control packets received since the server started. */
    readonly ConnectionBytesReceivedControl: "connection_bytes_received_control";
    /** `connection_packets_sent_total`: All packets sent since the server started. Also in hostinfo and clientinfo. */
    readonly ConnectionPacketsSentTotal: "connection_packets_sent_total";
    /** `connection_bytes_sent_total`: All bytes sent since the server started. Also in hostinfo and clientinfo. */
    readonly ConnectionBytesSentTotal: "connection_bytes_sent_total";
    /** `connection_packets_received_total`: All packets received since the server started. Also in hostinfo and clientinfo. */
    readonly ConnectionPacketsReceivedTotal: "connection_packets_received_total";
    /** `connection_bytes_received_total`: All bytes received since the server started. Also in hostinfo and clientinfo. */
    readonly ConnectionBytesReceivedTotal: "connection_bytes_received_total";
    /** `connection_bandwidth_sent_last_second_total`: Bytes per second sent, averaged over the last second. Also in hostinfo and clientinfo. */
    readonly ConnectionBandwidthSentLastSecondTotal: "connection_bandwidth_sent_last_second_total";
    /** `connection_bandwidth_sent_last_minute_total`: Bytes per second sent, averaged over the last minute. Also in hostinfo and clientinfo. */
    readonly ConnectionBandwidthSentLastMinuteTotal: "connection_bandwidth_sent_last_minute_total";
    /** `connection_bandwidth_received_last_second_total`: Bytes per second received, averaged over the last second. Also in hostinfo and clientinfo. */
    readonly ConnectionBandwidthReceivedLastSecondTotal: "connection_bandwidth_received_last_second_total";
    /** `connection_bandwidth_received_last_minute_total`: Bytes per second received, averaged over the last minute. Also in hostinfo and clientinfo. */
    readonly ConnectionBandwidthReceivedLastMinuteTotal: "connection_bandwidth_received_last_minute_total";
    /** `virtualserver_address`: Public address of the server. TeamSpeak 6 only. */
    readonly VirtualServerAddress: "virtualserver_address";
    /** `virtualserver_administrative_domain`: Administrative domain of the server. TeamSpeak 6 only. */
    readonly VirtualServerAdministrativeDomain: "virtualserver_administrative_domain";
    /** `virtualserver_canonical_name`: Canonical name of the server. TeamSpeak 6 only. */
    readonly VirtualServerCanonicalName: "virtualserver_canonical_name";
    /** `virtualserver_homebase_storage_quota`: Storage quota for homebase data, in bytes; 4294967295 means unlimited. TeamSpeak 6 only. */
    readonly VirtualServerHomeBaseStorageQuota: "virtualserver_homebase_storage_quota";
    /** `virtualserver_homebases`: Number of homebase users on this server. TeamSpeak 6 only. */
    readonly VirtualServerHomeBases: "virtualserver_homebases";
    /** `virtualserver_max_homebases`: Maximum number of homebase users this server accepts. TeamSpeak 6 only. */
    readonly VirtualServerMaxHomeBases: "virtualserver_max_homebases";
    /** `virtualserver_mytsid_connect_only`: 1 if only clients with a MyTeamSpeak id may connect, 0 if not. TeamSpeak 6 only. */
    readonly VirtualServerMyTSIDConnectOnly: "virtualserver_mytsid_connect_only";
    /** `virtualserver_sfu_endpoint`: Address of the server's SFU endpoint; empty if none. TeamSpeak 6 only. */
    readonly VirtualServerSFUEndpoint: "virtualserver_sfu_endpoint";
    /** `virtualserver_storage_quota`: Total file storage quota of the server, in bytes; 4294967295 means unlimited. TeamSpeak 6 only. */
    readonly VirtualServerStorageQuota: "virtualserver_storage_quota";
    /** `virtualserver_version_sign`: Signature that proves the server's version string is genuine, base64. TeamSpeak 6 only. */
    readonly VirtualServerVersionSign: "virtualserver_version_sign";
    /** `serverinstance_database_version`: Revision of the server database schema. */
    readonly ServerInstanceDatabaseVersion: "serverinstance_database_version";
    /** `serverinstance_filetransfer_port`: TCP port of the file transfer service. Editable. */
    readonly ServerInstanceFileTransferPort: "serverinstance_filetransfer_port";
    /** `serverinstance_max_download_total_bandwidth`: Maximum bandwidth of file transfer downloads for the whole instance, in bytes per second. Editable. */
    readonly ServerInstanceMaxDownloadTotalBandwidth: "serverinstance_max_download_total_bandwidth";
    /** `serverinstance_max_upload_total_bandwidth`: Maximum bandwidth of file transfer uploads for the whole instance, in bytes per second. Editable. */
    readonly ServerInstanceMaxUploadTotalBandwidth: "serverinstance_max_upload_total_bandwidth";
    /** `serverinstance_guest_serverquery_group`: Id of the server group given to ServerQuery clients that have not logged in. Editable. */
    readonly ServerInstanceGuestServerQueryGroup: "serverinstance_guest_serverquery_group";
    /** `serverinstance_serverquery_flood_commands`: Commands a ServerQuery client may send within the flood time before it is banned. Editable. */
    readonly ServerInstanceServerQueryFloodCommands: "serverinstance_serverquery_flood_commands";
    /** `serverinstance_serverquery_flood_time`: Time window, in seconds, in which ServerQuery commands are counted against the flood limit. Editable. */
    readonly ServerInstanceServerQueryFloodTime: "serverinstance_serverquery_flood_time";
    /** `serverinstance_serverquery_ban_time`: How long, in seconds, a ServerQuery client is banned for flooding. Editable. */
    readonly ServerInstanceServerQueryBanTime: "serverinstance_serverquery_ban_time";
    /** `serverinstance_template_serveradmin_group`: Id of the template server group used for server admins of new virtual servers. Editable. */
    readonly ServerInstanceTemplateServerAdminGroup: "serverinstance_template_serveradmin_group";
    /** `serverinstance_template_serverdefault_group`: Id of the template server group used as the default group of new virtual servers. Editable. */
    readonly ServerInstanceTemplateServerDefaultGroup: "serverinstance_template_serverdefault_group";
    /** `serverinstance_template_channeladmin_group`: Id of the template channel group used for channel admins of new virtual servers. Editable. */
    readonly ServerInstanceTemplateChannelAdminGroup: "serverinstance_template_channeladmin_group";
    /** `serverinstance_template_channeldefault_group`: Id of the template channel group used as the default channel group of new virtual servers. Editable. */
    readonly ServerInstanceTemplateChannelDefaultGroup: "serverinstance_template_channeldefault_group";
    /** `serverinstance_permissions_version`: Revision of the permission set the server knows. */
    readonly ServerInstancePermissionsVersion: "serverinstance_permissions_version";
    /** `serverinstance_pending_connections_per_ip`: Connections an IP address may have waiting to finish connecting; 0 means no limit. Editable. */
    readonly ServerInstancePendingConnectionsPerIP: "serverinstance_pending_connections_per_ip";
    /** `serverinstance_serverquery_max_connections_per_ip`: ServerQuery connections one IP address may hold open at the same time. Editable. */
    readonly ServerInstanceServerQueryMaxConnectionsPerIP: "serverinstance_serverquery_max_connections_per_ip";
    /** `serverinstance_max_homebases`: Maximum number of homebase users across the instance; -1 means unlimited. Editable. TeamSpeak 6 only. */
    readonly ServerInstanceMaxHomeBases: "serverinstance_max_homebases";
    /** `instance_uptime`: Seconds since the server instance started. */
    readonly InstanceUptime: "instance_uptime";
    /** `host_timestamp_utc`: The server's current time, as a Unix timestamp in seconds. */
    readonly HostTimestampUTC: "host_timestamp_utc";
    /** `virtualservers_running_total`: Number of virtual servers running. */
    readonly VirtualServersRunningTotal: "virtualservers_running_total";
    /** `virtualservers_total_maxclients`: Sum of the client limits of all running virtual servers. */
    readonly VirtualServersTotalMaxClients: "virtualservers_total_maxclients";
    /** `virtualservers_total_clients_online`: Clients online across all virtual servers. */
    readonly VirtualServersTotalClientsOnline: "virtualservers_total_clients_online";
    /** `virtualservers_total_channels_online`: Channels across all virtual servers. */
    readonly VirtualServersTotalChannelsOnline: "virtualservers_total_channels_online";
    /** `virtualservers_total_homebases`: Number of homebase users across all virtual servers. TeamSpeak 6 only. */
    readonly VirtualServersTotalHomeBases: "virtualservers_total_homebases";
    /** `virtualservers_total_max_homebases`: Maximum number of homebase users across all virtual servers; -1 means unlimited. TeamSpeak 6 only. */
    readonly VirtualServersTotalMaxHomeBases: "virtualservers_total_max_homebases";
    /** `cid`: Id of the channel the client is in. */
    readonly CID: "cid";
    /** `client_idle_time`: Milliseconds since the client was last active. */
    readonly ClientIdleTime: "client_idle_time";
    /** `client_unique_identifier`: The client's unique id, derived from its identity; a ServerQuery client has its login name. */
    readonly ClientUniqueIdentifier: "client_unique_identifier";
    /** `client_nickname`: Nickname of the client. Editable. */
    readonly ClientNickname: "client_nickname";
    /** `client_version`: Client version and build as the client reports it. */
    readonly ClientVersion: "client_version";
    /** `client_platform`: Operating system the client reports, such as Windows. */
    readonly ClientPlatform: "client_platform";
    /** `client_input_muted`: 1 if the client's microphone is muted, 0 if not. */
    readonly ClientInputMuted: "client_input_muted";
    /** `client_output_muted`: 1 if the client's speakers are muted, 0 if not. */
    readonly ClientOutputMuted: "client_output_muted";
    /** `client_outputonly_muted`: 1 if the client has muted all other clients' sound but not its own, 0 if not. */
    readonly ClientOutputOnlyMuted: "client_outputonly_muted";
    /** `client_input_hardware`: 1 if the client has a working capture device, 0 if not. */
    readonly ClientInputHardware: "client_input_hardware";
    /** `client_output_hardware`: 1 if the client has a working playback device, 0 if not. */
    readonly ClientOutputHardware: "client_output_hardware";
    /** `client_default_channel`: Path of the channel the client asked to join first; empty for none. */
    readonly ClientDefaultChannel: "client_default_channel";
    /** `client_meta_data`: Free-form data the client attaches to itself. */
    readonly ClientMetaData: "client_meta_data";
    /** `client_is_recording`: 1 if the client is recording the conversation, 0 if not. */
    readonly ClientIsRecording: "client_is_recording";
    /** `client_version_sign`: Signature that proves the client's version string is genuine, base64. */
    readonly ClientVersionSign: "client_version_sign";
    /** `client_security_hash`: The client's security hash; empty if it sent none. */
    readonly ClientSecurityHash: "client_security_hash";
    /** `client_is_streaming`: 1 if the client is streaming, 0 if not. TeamSpeak 6 only. */
    readonly ClientIsStreaming: "client_is_streaming";
    /** `client_login_name`: ServerQuery login name the client logged in with; empty for voice clients. */
    readonly ClientLoginName: "client_login_name";
    /** `client_database_id`: The client's id in the server database. */
    readonly ClientDatabaseID: "client_database_id";
    /** `client_channel_group_id`: Id of the client's channel group in its current channel. */
    readonly ClientChannelGroupID: "client_channel_group_id";
    /** `client_servergroups`: Ids of the client's server groups, separated by commas. */
    readonly ClientServerGroups: "client_servergroups";
    /** `client_created`: When the client first connected, as a Unix timestamp in seconds. */
    readonly ClientCreated: "client_created";
    /** `client_lastconnected`: When the client last connected, as a Unix timestamp in seconds. */
    readonly ClientLastConnected: "client_lastconnected";
    /** `client_totalconnections`: How many times the client has connected. */
    readonly ClientTotalConnections: "client_totalconnections";
    /** `client_away`: 1 if the client is away, 0 if not. */
    readonly ClientAway: "client_away";
    /** `client_away_message`: The client's away message. */
    readonly ClientAwayMessage: "client_away_message";
    /** `client_type`: 0 for a voice client, 1 for a ServerQuery client. */
    readonly ClientType: "client_type";
    /** `client_flag_avatar`: Checksum of the client's avatar file; empty if it has none. */
    readonly ClientFlagAvatar: "client_flag_avatar";
    /** `client_talk_power`: The client's talk power in its channel. */
    readonly ClientTalkPower: "client_talk_power";
    /** `client_talk_request`: Nonzero if the client has asked for talk power in a moderated channel, 0 if not. */
    readonly ClientTalkRequest: "client_talk_request";
    /** `client_talk_request_msg`: Message that came with the client's request for talk power. */
    readonly ClientTalkRequestMsg: "client_talk_request_msg";
    /** `client_description`: Brief description of the client (max 200 chars). Editable. */
    readonly ClientDescription: "client_description";
    /** `client_is_talker`: Indicates whether the client is able to talk or not. Editable. */
    readonly ClientIsTalker: "client_is_talker";
    /** `client_month_bytes_uploaded`: Bytes of file transfer uploads by the client this month. */
    readonly ClientMonthBytesUploaded: "client_month_bytes_uploaded";
    /** `client_month_bytes_downloaded`: Bytes of file transfer downloads by the client this month. */
    readonly ClientMonthBytesDownloaded: "client_month_bytes_downloaded";
    /** `client_total_bytes_uploaded`: Bytes of file transfer uploads by the client in total. */
    readonly ClientTotalBytesUploaded: "client_total_bytes_uploaded";
    /** `client_total_bytes_downloaded`: Bytes of file transfer downloads by the client in total. */
    readonly ClientTotalBytesDownloaded: "client_total_bytes_downloaded";
    /** `client_is_priority_speaker`: 1 if the client is a priority speaker, 0 if not. */
    readonly ClientIsPrioritySpeaker: "client_is_priority_speaker";
    /** `client_unread_messages`: Number of offline messages the client has not read. */
    readonly ClientUnreadMessages: "client_unread_messages";
    /** `client_nickname_phonetic`: Phonetic spelling of the client's nickname. */
    readonly ClientNicknamePhonetic: "client_nickname_phonetic";
    /** `client_needed_serverquery_view_power`: Power a ServerQuery client needs to see this client. */
    readonly ClientNeededServerQueryViewPower: "client_needed_serverquery_view_power";
    /** `client_default_token`: Privilege key the client used to connect, if any. */
    readonly ClientDefaultToken: "client_default_token";
    /** `client_icon_id`: CRC32 checksum of the client icon. Editable. */
    readonly ClientIconID: "client_icon_id";
    /** `client_is_channel_commander`: Indicates whether the client is a channel commander or not. Editable. */
    readonly ClientIsChannelCommander: "client_is_channel_commander";
    /** `client_country`: Two-letter country code of the client; empty if unknown. */
    readonly ClientCountry: "client_country";
    /** `client_channel_group_inherited_channel_id`: Id of the channel the client's channel group applies from, which is an ancestor when the group is inherited. */
    readonly ClientChannelGroupInheritedChannelID: "client_channel_group_inherited_channel_id";
    /** `client_badges`: Badges the client shows, as a string. */
    readonly ClientBadges: "client_badges";
    /** `client_myteamspeak_id`: The client's MyTeamSpeak id; empty if it is not logged in. */
    readonly ClientMyTeamSpeakID: "client_myteamspeak_id";
    /** `client_integrations`: Integrations the client has linked to its MyTeamSpeak account; empty for none. */
    readonly ClientIntegrations: "client_integrations";
    /** `client_myteamspeak_avatar`: Checksum of the client's MyTeamSpeak avatar; empty for none. */
    readonly ClientMyTeamSpeakAvatar: "client_myteamspeak_avatar";
    /** `client_signed_badges`: Badges the client shows, signed by TeamSpeak. */
    readonly ClientSignedBadges: "client_signed_badges";
    /** `client_user_tag`: Free-form tag the user has set for itself. TeamSpeak 6 only. */
    readonly ClientUserTag: "client_user_tag";
    /** `client_public_key_raw`: The client's raw public key, base64. TeamSpeak 6 only. */
    readonly ClientPublicKeyRaw: "client_public_key_raw";
    /** `client_base64HashClientUID`: The client's unique id hashed and re-encoded with the letters a to p, the form the TeamSpeak client uses to name its avatar files. */
    readonly ClientBase64HashClientUID: "client_base64HashClientUID";
    /** `connection_connected_time`: Milliseconds since the client connected. */
    readonly ConnectionConnectedTime: "connection_connected_time";
    /** `connection_client_ip`: The client's IP address. */
    readonly ConnectionClientIP: "connection_client_ip";
};
/** The property names; see {@link PropertyName}'s entries for what each holds. */
export declare const PropertyName: typeof propertyNameValues;
/** A property name a TeamSpeak 3.13 or 6 server reports. */
export type PropertyName = (typeof PropertyName)[keyof typeof PropertyName];
export {};
//# sourceMappingURL=property-name.d.ts.map