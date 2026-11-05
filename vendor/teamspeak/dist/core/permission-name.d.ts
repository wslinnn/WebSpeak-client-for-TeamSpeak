/**
 * The permissions a TeamSpeak server checks, by name, for
 * {@link permissionByName}:
 *
 * ```ts
 * await addChannelPermission(client, cid, permissionByName(PermissionName.ClientNeededTalkPower), 50);
 * ```
 *
 * These are the names TeamSpeak 3.13 and 6 servers list, in the order they
 * list them, measured with `permissionlist`; the fourteen marked TeamSpeak 6 only
 * are missing on TeamSpeak 3. Every permission has a twin,
 * `i_needed_modify_power_` followed by its name, which sets the modify power
 * needed to change it; those are the second block, named `NeededModifyPower`
 * followed by the permission's own name. A name starting `b_` is a switch, granted or
 * not; one starting `i_` is a value, such as a power compared with a needed
 * power. A server may know permissions this table does not, which is why
 * `permissionByName` takes any string.
 */
declare const permissionNameValues: {
    /** `b_serverinstance_help_view`: Retrieve information about ServerQuery commands. */
    readonly ServerInstanceHelpView: "b_serverinstance_help_view";
    /** `b_serverinstance_info_view`: Retrieve global server information. */
    readonly ServerInstanceInfoView: "b_serverinstance_info_view";
    /** `b_serverinstance_virtualserver_list`: List virtual servers stored in the database. */
    readonly ServerInstanceVirtualServerList: "b_serverinstance_virtualserver_list";
    /** `b_serverinstance_binding_list`: List active IP bindings on multi-homed machines. */
    readonly ServerInstanceBindingList: "b_serverinstance_binding_list";
    /** `b_serverinstance_permission_list`: List permissions available on the server instance. */
    readonly ServerInstancePermissionList: "b_serverinstance_permission_list";
    /** `b_serverinstance_permission_find`: Search permission assignments by name or ID. */
    readonly ServerInstancePermissionFind: "b_serverinstance_permission_find";
    /** `b_virtualserver_create`: Create virtual servers. */
    readonly VirtualServerCreate: "b_virtualserver_create";
    /** `b_virtualserver_delete`: Delete virtual servers. */
    readonly VirtualServerDelete: "b_virtualserver_delete";
    /** `b_virtualserver_start_any`: Start any virtual server in the server instance. */
    readonly VirtualServerStartAny: "b_virtualserver_start_any";
    /** `b_virtualserver_stop_any`: Stop any virtual server in the server instance. */
    readonly VirtualServerStopAny: "b_virtualserver_stop_any";
    /** `b_virtualserver_change_machine_id`: Change a virtual servers machine ID. */
    readonly VirtualServerChangeMachineID: "b_virtualserver_change_machine_id";
    /** `b_virtualserver_change_template`: Edit virtual server default template values. */
    readonly VirtualServerChangeTemplate: "b_virtualserver_change_template";
    /** `b_serverquery_login`: Login to ServerQuery. */
    readonly ServerQueryLogin: "b_serverquery_login";
    /** `b_serverquery_login_create`: Create a new server query login. */
    readonly ServerQueryLoginCreate: "b_serverquery_login_create";
    /** `b_serverquery_login_delete`: Delete a server query login. */
    readonly ServerQueryLoginDelete: "b_serverquery_login_delete";
    /** `b_serverquery_login_list`: List server query logins. */
    readonly ServerQueryLoginList: "b_serverquery_login_list";
    /** `b_serverinstance_textmessage_send`: Send text messages to all virtual servers at once. */
    readonly ServerInstanceTextMessageSend: "b_serverinstance_textmessage_send";
    /** `b_serverinstance_log_view`: Retrieve global server log. */
    readonly ServerInstanceLogView: "b_serverinstance_log_view";
    /** `b_serverinstance_log_add`: Write to global server log. */
    readonly ServerInstanceLogAdd: "b_serverinstance_log_add";
    /** `b_serverinstance_stop`: Shutdown the server process. */
    readonly ServerInstanceStop: "b_serverinstance_stop";
    /** `b_serverinstance_licensesign_message`: Sign arbitrary message with license key. TeamSpeak 6 only. */
    readonly ServerInstanceLicenseSignMessage: "b_serverinstance_licensesign_message";
    /** `b_serverinstance_modify_settings`: Edit global settings. */
    readonly ServerInstanceModifySettings: "b_serverinstance_modify_settings";
    /** `b_serverinstance_modify_querygroup`: Edit global ServerQuery groups. */
    readonly ServerInstanceModifyQueryGroup: "b_serverinstance_modify_querygroup";
    /** `b_serverinstance_modify_templates`: Edit global template groups. */
    readonly ServerInstanceModifyTemplates: "b_serverinstance_modify_templates";
    /** `b_virtualserver_select`: Select a virtual server. */
    readonly VirtualServerSelect: "b_virtualserver_select";
    /** `b_virtualserver_info_view`: Retrieve virtual server information. */
    readonly VirtualServerInfoView: "b_virtualserver_info_view";
    /** `b_virtualserver_connectioninfo_view`: Retrieve virtual server connection information. */
    readonly VirtualServerConnectionInfoView: "b_virtualserver_connectioninfo_view";
    /** `b_virtualserver_channel_list`: List channels on a virtual server. */
    readonly VirtualServerChannelList: "b_virtualserver_channel_list";
    /** `b_virtualserver_channel_search`: Search for channels on a virtual server. */
    readonly VirtualServerChannelSearch: "b_virtualserver_channel_search";
    /** `b_virtualserver_client_list`: List clients online on a virtual server. */
    readonly VirtualServerClientList: "b_virtualserver_client_list";
    /** `b_virtualserver_client_search`: Search for clients online on a virtual server. */
    readonly VirtualServerClientSearch: "b_virtualserver_client_search";
    /** `b_virtualserver_client_dblist`: List client identities known by the virtual server. */
    readonly VirtualServerClientDBList: "b_virtualserver_client_dblist";
    /** `b_virtualserver_client_dbsearch`: Search for client identities known by the virtual server. */
    readonly VirtualServerClientDBSearch: "b_virtualserver_client_dbsearch";
    /** `b_virtualserver_client_dbinfo`: Retrieve client information. */
    readonly VirtualServerClientDBInfo: "b_virtualserver_client_dbinfo";
    /** `b_virtualserver_permission_find`: Find permissions. */
    readonly VirtualServerPermissionFind: "b_virtualserver_permission_find";
    /** `b_virtualserver_custom_search`: Find custom fields. */
    readonly VirtualServerCustomSearch: "b_virtualserver_custom_search";
    /** `b_virtualserver_start`: Start own virtual server. */
    readonly VirtualServerStart: "b_virtualserver_start";
    /** `b_virtualserver_stop`: Stop own virtual server. */
    readonly VirtualServerStop: "b_virtualserver_stop";
    /** `b_virtualserver_token_list`: List privilege keys available. */
    readonly VirtualServerTokenList: "b_virtualserver_token_list";
    /** `b_virtualserver_token_add`: Create new privilege keys. */
    readonly VirtualServerTokenAdd: "b_virtualserver_token_add";
    /** `b_virtualserver_token_use`: Use a privilege keys to gain access to groups. */
    readonly VirtualServerTokenUse: "b_virtualserver_token_use";
    /** `b_virtualserver_token_delete`: Delete a privilege key. */
    readonly VirtualServerTokenDelete: "b_virtualserver_token_delete";
    /** `b_virtualserver_apikey_add`: Create a new API key. */
    readonly VirtualServerAPIKeyAdd: "b_virtualserver_apikey_add";
    /** `b_virtualserver_apikey_manage`: Manage existing API keys. */
    readonly VirtualServerAPIKeyManage: "b_virtualserver_apikey_manage";
    /** `b_virtualserver_log_view`: Retrieve virtual server log. */
    readonly VirtualServerLogView: "b_virtualserver_log_view";
    /** `b_virtualserver_log_add`: Write to virtual server log. */
    readonly VirtualServerLogAdd: "b_virtualserver_log_add";
    /** `b_virtualserver_join_ignore_password`: Join virtual server ignoring its password. */
    readonly VirtualServerJoinIgnorePassword: "b_virtualserver_join_ignore_password";
    /** `b_virtualserver_notify_register`: Register for server notifications. */
    readonly VirtualServerNotifyRegister: "b_virtualserver_notify_register";
    /** `b_virtualserver_notify_unregister`: Unregister from server notifications. */
    readonly VirtualServerNotifyUnregister: "b_virtualserver_notify_unregister";
    /** `b_virtualserver_snapshot_create`: Create server snapshots. */
    readonly VirtualServerSnapshotCreate: "b_virtualserver_snapshot_create";
    /** `b_virtualserver_snapshot_deploy`: Deploy server snapshots. */
    readonly VirtualServerSnapshotDeploy: "b_virtualserver_snapshot_deploy";
    /** `b_virtualserver_permission_reset`: Reset the server permission settings to default values. */
    readonly VirtualServerPermissionReset: "b_virtualserver_permission_reset";
    /** `b_virtualserver_canonical_name_manage`: Manage canonical name of the virtual server. TeamSpeak 6 only. */
    readonly VirtualServerCanonicalNameManage: "b_virtualserver_canonical_name_manage";
    /** `b_virtualserver_modify_name`: Modify server name. */
    readonly VirtualServerModifyName: "b_virtualserver_modify_name";
    /** `b_virtualserver_modify_welcomemessage`: Modify welcome message. */
    readonly VirtualServerModifyWelcomeMessage: "b_virtualserver_modify_welcomemessage";
    /** `b_virtualserver_modify_maxclients`: Modify servers max clients. */
    readonly VirtualServerModifyMaxClients: "b_virtualserver_modify_maxclients";
    /** `b_virtualserver_modify_reserved_slots`: Modify reserved slots. */
    readonly VirtualServerModifyReservedSlots: "b_virtualserver_modify_reserved_slots";
    /** `b_virtualserver_modify_password`: Modify server password. */
    readonly VirtualServerModifyPassword: "b_virtualserver_modify_password";
    /** `b_virtualserver_modify_default_servergroup`: Modify default Server Group. */
    readonly VirtualServerModifyDefaultServerGroup: "b_virtualserver_modify_default_servergroup";
    /** `b_virtualserver_modify_default_channelgroup`: Modify default Channel Group. */
    readonly VirtualServerModifyDefaultChannelGroup: "b_virtualserver_modify_default_channelgroup";
    /** `b_virtualserver_modify_default_channeladmingroup`: Modify default Channel Admin Group. */
    readonly VirtualServerModifyDefaultChannelAdminGroup: "b_virtualserver_modify_default_channeladmingroup";
    /** `b_virtualserver_modify_channel_forced_silence`: Modify channel force silence value. */
    readonly VirtualServerModifyChannelForcedSilence: "b_virtualserver_modify_channel_forced_silence";
    /** `b_virtualserver_modify_complain`: Modify individual complain settings. */
    readonly VirtualServerModifyComplain: "b_virtualserver_modify_complain";
    /** `b_virtualserver_modify_antiflood`: Modify individual antiflood settings. */
    readonly VirtualServerModifyAntiflood: "b_virtualserver_modify_antiflood";
    /** `b_virtualserver_modify_ft_settings`: Modify file transfer settings. */
    readonly VirtualServerModifyFTSettings: "b_virtualserver_modify_ft_settings";
    /** `b_virtualserver_modify_ft_quotas`: Modify file transfer quotas. */
    readonly VirtualServerModifyFTQuotas: "b_virtualserver_modify_ft_quotas";
    /** `b_virtualserver_modify_hostmessage`: Modify individual hostmessage settings. */
    readonly VirtualServerModifyHostMessage: "b_virtualserver_modify_hostmessage";
    /** `b_virtualserver_modify_hostbanner`: Modify individual hostbanner settings. */
    readonly VirtualServerModifyHostBanner: "b_virtualserver_modify_hostbanner";
    /** `b_virtualserver_modify_hostbutton`: Modify individual hostbutton settings. */
    readonly VirtualServerModifyHostButton: "b_virtualserver_modify_hostbutton";
    /** `b_virtualserver_modify_port`: Modify server port. */
    readonly VirtualServerModifyPort: "b_virtualserver_modify_port";
    /** `b_virtualserver_modify_autostart`: Modify server autostart. */
    readonly VirtualServerModifyAutoStart: "b_virtualserver_modify_autostart";
    /** `b_virtualserver_modify_needed_identity_security_level`: Modify required identity security level. */
    readonly VirtualServerModifyNeededIdentitySecurityLevel: "b_virtualserver_modify_needed_identity_security_level";
    /** `b_virtualserver_modify_priority_speaker_dimm_modificator`: Modify priority speaker dimm modificator. */
    readonly VirtualServerModifyPrioritySpeakerDimmModificator: "b_virtualserver_modify_priority_speaker_dimm_modificator";
    /** `b_virtualserver_modify_log_settings`: Modify log settings. */
    readonly VirtualServerModifyLogSettings: "b_virtualserver_modify_log_settings";
    /** `b_virtualserver_modify_min_client_version`: Modify min client version. */
    readonly VirtualServerModifyMinClientVersion: "b_virtualserver_modify_min_client_version";
    /** `b_virtualserver_modify_icon_id`: Modify server icon. */
    readonly VirtualServerModifyIconID: "b_virtualserver_modify_icon_id";
    /** `b_virtualserver_modify_weblist`: Modify web server list reporting settings. */
    readonly VirtualServerModifyWebList: "b_virtualserver_modify_weblist";
    /** `b_virtualserver_modify_codec_encryption_mode`: Modify codec encryption mode. */
    readonly VirtualServerModifyCodecEncryptionMode: "b_virtualserver_modify_codec_encryption_mode";
    /** `b_virtualserver_modify_temporary_passwords`: Modify temporary serverpasswords. */
    readonly VirtualServerModifyTemporaryPasswords: "b_virtualserver_modify_temporary_passwords";
    /** `b_virtualserver_modify_temporary_passwords_own`: Modify own temporary serverpasswords. */
    readonly VirtualServerModifyTemporaryPasswordsOwn: "b_virtualserver_modify_temporary_passwords_own";
    /** `b_virtualserver_modify_channel_temp_delete_delay_default`: Modify default temporary channel delete delay. */
    readonly VirtualServerModifyChannelTempDeleteDelayDefault: "b_virtualserver_modify_channel_temp_delete_delay_default";
    /** `b_virtualserver_modify_nickname`: Modify server nicknames. */
    readonly VirtualServerModifyNickname: "b_virtualserver_modify_nickname";
    /** `b_virtualserver_modify_integrations`: Modify integrations. */
    readonly VirtualServerModifyIntegrations: "b_virtualserver_modify_integrations";
    /** `b_virtualserver_modify_mytsid_connect`: Modify mytsid connect. TeamSpeak 6 only. */
    readonly VirtualServerModifyMyTSIDConnect: "b_virtualserver_modify_mytsid_connect";
    /** `i_channel_min_depth`: Min channel creation depth in hierarchy. */
    readonly ChannelMinDepth: "i_channel_min_depth";
    /** `i_channel_max_depth`: Max channel creation depth in hierarchy. */
    readonly ChannelMaxDepth: "i_channel_max_depth";
    /** `b_channel_group_inheritance_end`: Stop inheritance of channel group permissions. */
    readonly ChannelGroupInheritanceEnd: "b_channel_group_inheritance_end";
    /** `i_channel_permission_modify_power`: Modify channel permission power. */
    readonly ChannelPermissionModifyPower: "i_channel_permission_modify_power";
    /** `i_channel_needed_permission_modify_power`: Needed modify channel permission power. */
    readonly ChannelNeededPermissionModifyPower: "i_channel_needed_permission_modify_power";
    /** `b_channel_info_view`: Retrieve channel information. */
    readonly ChannelInfoView: "b_channel_info_view";
    /** `b_channel_create_child`: Create sub-channels. */
    readonly ChannelCreateChild: "b_channel_create_child";
    /** `b_channel_create_permanent`: Create permanent channels. */
    readonly ChannelCreatePermanent: "b_channel_create_permanent";
    /** `b_channel_create_semi_permanent`: Create semi-permanent channels. */
    readonly ChannelCreateSemiPermanent: "b_channel_create_semi_permanent";
    /** `b_channel_create_temporary`: Create temporary channels. */
    readonly ChannelCreateTemporary: "b_channel_create_temporary";
    /** `b_channel_create_with_topic`: Create channels with a topic. */
    readonly ChannelCreateWithTopic: "b_channel_create_with_topic";
    /** `b_channel_create_with_description`: Create channels with a description. */
    readonly ChannelCreateWithDescription: "b_channel_create_with_description";
    /** `b_channel_create_with_password`: Create password protected channels. */
    readonly ChannelCreateWithPassword: "b_channel_create_with_password";
    /** `b_channel_create_with_banner`: Create channel with a banner. */
    readonly ChannelCreateWithBanner: "b_channel_create_with_banner";
    /** `b_channel_create_modify_with_codec_opusvoice`: Create channels using OPUS (voice) codec. */
    readonly ChannelCreateModifyWithCodecOpusVoice: "b_channel_create_modify_with_codec_opusvoice";
    /** `b_channel_create_modify_with_codec_opusmusic`: Create channels using OPUS (music) codec. */
    readonly ChannelCreateModifyWithCodecOpusMusic: "b_channel_create_modify_with_codec_opusmusic";
    /** `i_channel_create_modify_with_codec_maxquality`: Create channels with custom codec quality. */
    readonly ChannelCreateModifyWithCodecMaxQuality: "i_channel_create_modify_with_codec_maxquality";
    /** `i_channel_create_modify_with_codec_latency_factor_min`: Create channels with minimal custom codec latency factor. */
    readonly ChannelCreateModifyWithCodecLatencyFactorMin: "i_channel_create_modify_with_codec_latency_factor_min";
    /** `b_channel_create_with_maxclients`: Create channels with custom max clients. */
    readonly ChannelCreateWithMaxClients: "b_channel_create_with_maxclients";
    /** `b_channel_create_with_maxfamilyclients`: Create channels with custom max family clients. */
    readonly ChannelCreateWithMaxFamilyClients: "b_channel_create_with_maxfamilyclients";
    /** `b_channel_create_with_sortorder`: Create channels with custom sort order. */
    readonly ChannelCreateWithSortOrder: "b_channel_create_with_sortorder";
    /** `b_channel_create_with_default`: Create default channels. */
    readonly ChannelCreateWithDefault: "b_channel_create_with_default";
    /** `b_channel_create_with_needed_talk_power`: Create channels with needed talk power. */
    readonly ChannelCreateWithNeededTalkPower: "b_channel_create_with_needed_talk_power";
    /** `b_channel_create_modify_with_force_password`: Create new channels only with password. */
    readonly ChannelCreateModifyWithForcePassword: "b_channel_create_modify_with_force_password";
    /** `i_channel_create_modify_with_temp_delete_delay`: Max delete delay for temporary channels. */
    readonly ChannelCreateModifyWithTempDeleteDelay: "i_channel_create_modify_with_temp_delete_delay";
    /** `b_channel_modify_parent`: Move channels. */
    readonly ChannelModifyParent: "b_channel_modify_parent";
    /** `b_channel_modify_make_default`: Make channel default. */
    readonly ChannelModifyMakeDefault: "b_channel_modify_make_default";
    /** `b_channel_modify_make_permanent`: Make channel permanent. */
    readonly ChannelModifyMakePermanent: "b_channel_modify_make_permanent";
    /** `b_channel_modify_make_semi_permanent`: Make channel semi-permanent. */
    readonly ChannelModifyMakeSemiPermanent: "b_channel_modify_make_semi_permanent";
    /** `b_channel_modify_make_temporary`: Make channel temporary. */
    readonly ChannelModifyMakeTemporary: "b_channel_modify_make_temporary";
    /** `b_channel_modify_name`: Modify channel name. */
    readonly ChannelModifyName: "b_channel_modify_name";
    /** `b_channel_modify_topic`: Modify channel topic. */
    readonly ChannelModifyTopic: "b_channel_modify_topic";
    /** `b_channel_modify_description`: Modify channel description. */
    readonly ChannelModifyDescription: "b_channel_modify_description";
    /** `b_channel_modify_password`: Modify channel password. */
    readonly ChannelModifyPassword: "b_channel_modify_password";
    /** `b_channel_modify_banner`: Modify channel banner. */
    readonly ChannelModifyBanner: "b_channel_modify_banner";
    /** `b_channel_modify_codec`: Modify channel codec. */
    readonly ChannelModifyCodec: "b_channel_modify_codec";
    /** `b_channel_modify_codec_quality`: Modify channel codec quality. */
    readonly ChannelModifyCodecQuality: "b_channel_modify_codec_quality";
    /** `b_channel_modify_codec_latency_factor`: Modify channel codec latency factor. */
    readonly ChannelModifyCodecLatencyFactor: "b_channel_modify_codec_latency_factor";
    /** `b_channel_modify_maxclients`: Modify channels max clients. */
    readonly ChannelModifyMaxClients: "b_channel_modify_maxclients";
    /** `b_channel_modify_maxfamilyclients`: Modify channels max family clients. */
    readonly ChannelModifyMaxFamilyClients: "b_channel_modify_maxfamilyclients";
    /** `b_channel_modify_sortorder`: Modify channel sort order. */
    readonly ChannelModifySortOrder: "b_channel_modify_sortorder";
    /** `b_channel_modify_needed_talk_power`: Change needed channel talk power. */
    readonly ChannelModifyNeededTalkPower: "b_channel_modify_needed_talk_power";
    /** `i_channel_modify_power`: Channel modify power. */
    readonly ChannelModifyPower: "i_channel_modify_power";
    /** `i_channel_needed_modify_power`: Needed channel modify power. */
    readonly ChannelNeededModifyPower: "i_channel_needed_modify_power";
    /** `b_channel_modify_make_codec_encrypted`: Make channel codec encrypted. */
    readonly ChannelModifyMakeCodecEncrypted: "b_channel_modify_make_codec_encrypted";
    /** `b_channel_modify_temp_delete_delay`: Modify temporary channel delete delay. */
    readonly ChannelModifyTempDeleteDelay: "b_channel_modify_temp_delete_delay";
    /** `b_channel_modify_ft_quotas`: Modify file transfer quotas. TeamSpeak 6 only. */
    readonly ChannelModifyFTQuotas: "b_channel_modify_ft_quotas";
    /** `b_channel_delete_permanent`: Delete permanent channels. */
    readonly ChannelDeletePermanent: "b_channel_delete_permanent";
    /** `b_channel_delete_semi_permanent`: Delete semi-permanent channels. */
    readonly ChannelDeleteSemiPermanent: "b_channel_delete_semi_permanent";
    /** `b_channel_delete_temporary`: Delete temporary channels. */
    readonly ChannelDeleteTemporary: "b_channel_delete_temporary";
    /** `b_channel_delete_flag_force`: Force channel delete. */
    readonly ChannelDeleteFlagForce: "b_channel_delete_flag_force";
    /** `i_channel_delete_power`: Delete channel power. */
    readonly ChannelDeletePower: "i_channel_delete_power";
    /** `i_channel_needed_delete_power`: Needed delete channel power. */
    readonly ChannelNeededDeletePower: "i_channel_needed_delete_power";
    /** `b_channel_join_permanent`: Join permanent channels. */
    readonly ChannelJoinPermanent: "b_channel_join_permanent";
    /** `b_channel_join_semi_permanent`: Join semi-permanent channels. */
    readonly ChannelJoinSemiPermanent: "b_channel_join_semi_permanent";
    /** `b_channel_join_temporary`: Join temporary channels. */
    readonly ChannelJoinTemporary: "b_channel_join_temporary";
    /** `b_channel_join_ignore_password`: Join channel ignoring its password. */
    readonly ChannelJoinIgnorePassword: "b_channel_join_ignore_password";
    /** `b_channel_join_ignore_maxclients`: Ignore channels max clients limit. */
    readonly ChannelJoinIgnoreMaxClients: "b_channel_join_ignore_maxclients";
    /** `i_channel_join_power`: Channel join power. */
    readonly ChannelJoinPower: "i_channel_join_power";
    /** `i_channel_needed_join_power`: Needed channel join power. */
    readonly ChannelNeededJoinPower: "i_channel_needed_join_power";
    /** `i_channel_subscribe_power`: Channel subscribe power. */
    readonly ChannelSubscribePower: "i_channel_subscribe_power";
    /** `i_channel_needed_subscribe_power`: Needed channel subscribe power. */
    readonly ChannelNeededSubscribePower: "i_channel_needed_subscribe_power";
    /** `i_channel_description_view_power`: Channel description view power. */
    readonly ChannelDescriptionViewPower: "i_channel_description_view_power";
    /** `i_channel_needed_description_view_power`: Needed channel needed description view power. */
    readonly ChannelNeededDescriptionViewPower: "i_channel_needed_description_view_power";
    /** `i_icon_id`: Group icon identifier. */
    readonly IconID: "i_icon_id";
    /** `i_max_icon_filesize`: Max icon filesize in bytes. */
    readonly MaxIconFileSize: "i_max_icon_filesize";
    /** `b_icon_manage`: Enables icon management. */
    readonly IconManage: "b_icon_manage";
    /** `b_group_is_permanent`: Group is permanent. */
    readonly GroupIsPermanent: "b_group_is_permanent";
    /** `i_group_auto_update_type`: Group auto-update type. */
    readonly GroupAutoUpdateType: "i_group_auto_update_type";
    /** `i_group_auto_update_max_value`: Group auto-update max value. */
    readonly GroupAutoUpdateMaxValue: "i_group_auto_update_max_value";
    /** `i_group_sort_id`: Group sort id. */
    readonly GroupSortID: "i_group_sort_id";
    /** `i_group_show_name_in_tree`: Show group name in tree depending on selected mode. */
    readonly GroupShowNameInTree: "i_group_show_name_in_tree";
    /** `b_virtualserver_servergroup_list`: List server groups. */
    readonly VirtualServerServerGroupList: "b_virtualserver_servergroup_list";
    /** `b_virtualserver_servergroup_permission_list`: List server group permissions. */
    readonly VirtualServerServerGroupPermissionList: "b_virtualserver_servergroup_permission_list";
    /** `b_virtualserver_servergroup_client_list`: List clients from a server group. */
    readonly VirtualServerServerGroupClientList: "b_virtualserver_servergroup_client_list";
    /** `b_virtualserver_channelgroup_list`: List channel groups. */
    readonly VirtualServerChannelGroupList: "b_virtualserver_channelgroup_list";
    /** `b_virtualserver_channelgroup_permission_list`: List channel group permissions. */
    readonly VirtualServerChannelGroupPermissionList: "b_virtualserver_channelgroup_permission_list";
    /** `b_virtualserver_channelgroup_client_list`: List clients from a channel group. */
    readonly VirtualServerChannelGroupClientList: "b_virtualserver_channelgroup_client_list";
    /** `b_virtualserver_client_permission_list`: List client permissions. */
    readonly VirtualServerClientPermissionList: "b_virtualserver_client_permission_list";
    /** `b_virtualserver_channel_permission_list`: List channel permissions. */
    readonly VirtualServerChannelPermissionList: "b_virtualserver_channel_permission_list";
    /** `b_virtualserver_channelclient_permission_list`: List channel client permissions. */
    readonly VirtualServerChannelClientPermissionList: "b_virtualserver_channelclient_permission_list";
    /** `b_virtualserver_servergroup_create`: Create server groups. */
    readonly VirtualServerServerGroupCreate: "b_virtualserver_servergroup_create";
    /** `b_virtualserver_channelgroup_create`: Create channel groups. */
    readonly VirtualServerChannelGroupCreate: "b_virtualserver_channelgroup_create";
    /** `i_group_modify_power`: Group modify power. */
    readonly GroupModifyPower: "i_group_modify_power";
    /** `i_group_needed_modify_power`: Needed group modify power. */
    readonly GroupNeededModifyPower: "i_group_needed_modify_power";
    /** `i_group_member_add_power`: Group member add power. */
    readonly GroupMemberAddPower: "i_group_member_add_power";
    /** `i_group_needed_member_add_power`: Needed group member add power. */
    readonly GroupNeededMemberAddPower: "i_group_needed_member_add_power";
    /** `i_group_member_remove_power`: Group member delete power. */
    readonly GroupMemberRemovePower: "i_group_member_remove_power";
    /** `i_group_needed_member_remove_power`: Needed group member delete power. */
    readonly GroupNeededMemberRemovePower: "i_group_needed_member_remove_power";
    /** `i_permission_modify_power`: Permission modify power. */
    readonly PermissionModifyPower: "i_permission_modify_power";
    /** `b_permission_modify_power_ignore`: Ignore needed permission modify power. */
    readonly PermissionModifyPowerIgnore: "b_permission_modify_power_ignore";
    /** `b_virtualserver_servergroup_delete`: Delete server groups. */
    readonly VirtualServerServerGroupDelete: "b_virtualserver_servergroup_delete";
    /** `b_virtualserver_channelgroup_delete`: Delete channel groups. */
    readonly VirtualServerChannelGroupDelete: "b_virtualserver_channelgroup_delete";
    /** `i_client_permission_modify_power`: Client permission modify power. */
    readonly ClientPermissionModifyPower: "i_client_permission_modify_power";
    /** `i_client_needed_permission_modify_power`: Needed client permission modify power. */
    readonly ClientNeededPermissionModifyPower: "i_client_needed_permission_modify_power";
    /** `i_client_max_clones_uid`: Max additional connections per client identity. */
    readonly ClientMaxClonesUID: "i_client_max_clones_uid";
    /** `i_client_max_idletime`: Max idle time in seconds. */
    readonly ClientMaxIdleTime: "i_client_max_idletime";
    /** `i_client_max_avatar_filesize`: Max avatar filesize in bytes. */
    readonly ClientMaxAvatarFileSize: "i_client_max_avatar_filesize";
    /** `i_client_max_channel_subscriptions`: Max channel subscriptions. */
    readonly ClientMaxChannelSubscriptions: "i_client_max_channel_subscriptions";
    /** `b_client_is_priority_speaker`: Client is priority speaker. */
    readonly ClientIsPrioritySpeaker: "b_client_is_priority_speaker";
    /** `b_client_skip_channelgroup_permissions`: Ignore channel group permissions. */
    readonly ClientSkipChannelGroupPermissions: "b_client_skip_channelgroup_permissions";
    /** `b_client_force_push_to_talk`: Force Push-To-Talk capture mode. */
    readonly ClientForcePushToTalk: "b_client_force_push_to_talk";
    /** `b_client_ignore_bans`: Ignore bans. */
    readonly ClientIgnoreBans: "b_client_ignore_bans";
    /** `b_client_ignore_antiflood`: Ignore antiflood measurements. */
    readonly ClientIgnoreAntiflood: "b_client_ignore_antiflood";
    /** `b_client_use_reserved_slot`: Use an reserved slot. */
    readonly ClientUseReservedSlot: "b_client_use_reserved_slot";
    /** `b_client_use_channel_commander`: Use channel commander. */
    readonly ClientUseChannelCommander: "b_client_use_channel_commander";
    /** `b_client_request_talker`: Allow to request talk power. */
    readonly ClientRequestTalker: "b_client_request_talker";
    /** `b_client_avatar_delete_other`: Allow deletion of avatars from other clients. */
    readonly ClientAvatarDeleteOther: "b_client_avatar_delete_other";
    /** `b_client_is_sticky`: Client will be sticked to current channel. */
    readonly ClientIsSticky: "b_client_is_sticky";
    /** `b_client_ignore_sticky`: Client ignores sticky flag. */
    readonly ClientIgnoreSticky: "b_client_ignore_sticky";
    /** `b_client_info_view`: Retrieve client information. */
    readonly ClientInfoView: "b_client_info_view";
    /** `b_client_permissionoverview_view`: Retrieve client permissions overview. */
    readonly ClientPermissionOverviewView: "b_client_permissionoverview_view";
    /** `b_client_permissionoverview_own`: Retrieve clients own permissions overview. */
    readonly ClientPermissionOverviewOwn: "b_client_permissionoverview_own";
    /** `b_client_remoteaddress_view`: View client IP address and port. */
    readonly ClientRemoteAddressView: "b_client_remoteaddress_view";
    /** `i_client_serverquery_view_power`: ServerQuery view power. */
    readonly ClientServerQueryViewPower: "i_client_serverquery_view_power";
    /** `i_client_needed_serverquery_view_power`: Needed ServerQuery view power. */
    readonly ClientNeededServerQueryViewPower: "i_client_needed_serverquery_view_power";
    /** `b_client_custom_info_view`: View custom fields. */
    readonly ClientCustomInfoView: "b_client_custom_info_view";
    /** `i_client_kick_from_server_power`: Client kick power from server. */
    readonly ClientKickFromServerPower: "i_client_kick_from_server_power";
    /** `i_client_needed_kick_from_server_power`: Needed client kick power from server. */
    readonly ClientNeededKickFromServerPower: "i_client_needed_kick_from_server_power";
    /** `i_client_kick_from_channel_power`: Client kick power from channel. */
    readonly ClientKickFromChannelPower: "i_client_kick_from_channel_power";
    /** `i_client_needed_kick_from_channel_power`: Needed client kick power from channel. */
    readonly ClientNeededKickFromChannelPower: "i_client_needed_kick_from_channel_power";
    /** `i_client_ban_power`: Client ban power. */
    readonly ClientBanPower: "i_client_ban_power";
    /** `i_client_needed_ban_power`: Needed client ban power. */
    readonly ClientNeededBanPower: "i_client_needed_ban_power";
    /** `i_client_move_power`: Client move power. */
    readonly ClientMovePower: "i_client_move_power";
    /** `i_client_needed_move_power`: Needed client move power. */
    readonly ClientNeededMovePower: "i_client_needed_move_power";
    /** `i_client_complain_power`: Complain power. */
    readonly ClientComplainPower: "i_client_complain_power";
    /** `i_client_needed_complain_power`: Needed complain power. */
    readonly ClientNeededComplainPower: "i_client_needed_complain_power";
    /** `b_client_complain_list`: Show complain list. */
    readonly ClientComplainList: "b_client_complain_list";
    /** `b_client_complain_delete_own`: Delete own complains. */
    readonly ClientComplainDeleteOwn: "b_client_complain_delete_own";
    /** `b_client_complain_delete`: Delete complains. */
    readonly ClientComplainDelete: "b_client_complain_delete";
    /** `b_client_ban_list`: Show banlist. */
    readonly ClientBanList: "b_client_ban_list";
    /** `b_client_ban_create`: Add a ban. */
    readonly ClientBanCreate: "b_client_ban_create";
    /** `b_client_ban_delete_own`: Delete own bans. */
    readonly ClientBanDeleteOwn: "b_client_ban_delete_own";
    /** `b_client_ban_delete`: Delete bans. */
    readonly ClientBanDelete: "b_client_ban_delete";
    /** `i_client_ban_max_bantime`: Max bantime. */
    readonly ClientBanMaxBanTime: "i_client_ban_max_bantime";
    /** `b_channel_textmessage_delete`: Delete decentral chat messages. TeamSpeak 6 only. */
    readonly ChannelTextMessageDelete: "b_channel_textmessage_delete";
    /** `i_client_private_textmessage_power`: Client private message power. */
    readonly ClientPrivateTextMessagePower: "i_client_private_textmessage_power";
    /** `i_client_needed_private_textmessage_power`: Needed client private message power. */
    readonly ClientNeededPrivateTextMessagePower: "i_client_needed_private_textmessage_power";
    /** `b_client_server_textmessage_send`: Send text messages to virtual server. */
    readonly ClientServerTextMessageSend: "b_client_server_textmessage_send";
    /** `b_client_channel_textmessage_send`: Send text messages to channel. */
    readonly ClientChannelTextMessageSend: "b_client_channel_textmessage_send";
    /** `b_client_offline_textmessage_send`: Send offline messages to clients. */
    readonly ClientOfflineTextMessageSend: "b_client_offline_textmessage_send";
    /** `i_client_talk_power`: Client talk power. */
    readonly ClientTalkPower: "i_client_talk_power";
    /** `i_client_needed_talk_power`: Needed client talk power. */
    readonly ClientNeededTalkPower: "i_client_needed_talk_power";
    /** `i_client_poke_power`: Client poke power. */
    readonly ClientPokePower: "i_client_poke_power";
    /** `i_client_needed_poke_power`: Needed client poke power. */
    readonly ClientNeededPokePower: "i_client_needed_poke_power";
    /** `b_client_set_flag_talker`: Set the talker flag for clients and allow them to speak. */
    readonly ClientSetFlagTalker: "b_client_set_flag_talker";
    /** `i_client_whisper_power`: Client whisper power. */
    readonly ClientWhisperPower: "i_client_whisper_power";
    /** `i_client_needed_whisper_power`: Client needed whisper power. */
    readonly ClientNeededWhisperPower: "i_client_needed_whisper_power";
    /** `b_client_modify_description`: Edit a clients description. */
    readonly ClientModifyDescription: "b_client_modify_description";
    /** `b_client_modify_own_description`: Allow client to edit own description. */
    readonly ClientModifyOwnDescription: "b_client_modify_own_description";
    /** `b_client_modify_dbproperties`: Edit a clients properties in the database. */
    readonly ClientModifyDBProperties: "b_client_modify_dbproperties";
    /** `b_client_delete_dbproperties`: Delete a clients properties in the database. */
    readonly ClientDeleteDBProperties: "b_client_delete_dbproperties";
    /** `b_client_create_modify_serverquery_login`: Create or modify own ServerQuery account. */
    readonly ClientCreateModifyServerQueryLogin: "b_client_create_modify_serverquery_login";
    /** `b_ft_ignore_password`: Browse files without channel password. */
    readonly FTIgnorePassword: "b_ft_ignore_password";
    /** `b_ft_transfer_list`: Retrieve list of running filetransfers. */
    readonly FTTransferList: "b_ft_transfer_list";
    /** `i_ft_file_upload_power`: File upload power. */
    readonly FTFileUploadPower: "i_ft_file_upload_power";
    /** `i_ft_needed_file_upload_power`: Needed file upload power. */
    readonly FTNeededFileUploadPower: "i_ft_needed_file_upload_power";
    /** `i_ft_file_download_power`: File download power. */
    readonly FTFileDownloadPower: "i_ft_file_download_power";
    /** `i_ft_needed_file_download_power`: Needed file download power. */
    readonly FTNeededFileDownloadPower: "i_ft_needed_file_download_power";
    /** `i_ft_file_delete_power`: File delete power. */
    readonly FTFileDeletePower: "i_ft_file_delete_power";
    /** `i_ft_needed_file_delete_power`: Needed file delete power. */
    readonly FTNeededFileDeletePower: "i_ft_needed_file_delete_power";
    /** `i_ft_file_rename_power`: File rename power. */
    readonly FTFileRenamePower: "i_ft_file_rename_power";
    /** `i_ft_needed_file_rename_power`: Needed file rename power. */
    readonly FTNeededFileRenamePower: "i_ft_needed_file_rename_power";
    /** `i_ft_file_browse_power`: File browse power. */
    readonly FTFileBrowsePower: "i_ft_file_browse_power";
    /** `i_ft_needed_file_browse_power`: Needed file browse power. */
    readonly FTNeededFileBrowsePower: "i_ft_needed_file_browse_power";
    /** `i_ft_directory_create_power`: Create directory power. */
    readonly FTDirectoryCreatePower: "i_ft_directory_create_power";
    /** `i_ft_needed_directory_create_power`: Needed create directory power. */
    readonly FTNeededDirectoryCreatePower: "i_ft_needed_directory_create_power";
    /** `i_ft_quota_mb_download_per_client`: Download quota per client in MByte. */
    readonly FTQuotaMBDownloadPerClient: "i_ft_quota_mb_download_per_client";
    /** `i_ft_quota_mb_upload_per_client`: Upload quota per client in MByte. */
    readonly FTQuotaMBUploadPerClient: "i_ft_quota_mb_upload_per_client";
    /** `i_ft_storage_mb_per_client`: File Storage space per client in MByte. TeamSpeak 6 only. */
    readonly FTStorageMBPerClient: "i_ft_storage_mb_per_client";
    /** `i_ft_max_file_size_mb`: Maximum file size of a single file this client can upload. TeamSpeak 6 only. */
    readonly FTMaxFileSizeMB: "i_ft_max_file_size_mb";
    /** `i_needed_modify_power_serverinstance_help_view`: The power needed to modify `b_serverinstance_help_view`. */
    readonly NeededModifyPowerServerInstanceHelpView: "i_needed_modify_power_serverinstance_help_view";
    /** `i_needed_modify_power_serverinstance_info_view`: The power needed to modify `b_serverinstance_info_view`. */
    readonly NeededModifyPowerServerInstanceInfoView: "i_needed_modify_power_serverinstance_info_view";
    /** `i_needed_modify_power_serverinstance_virtualserver_list`: The power needed to modify `b_serverinstance_virtualserver_list`. */
    readonly NeededModifyPowerServerInstanceVirtualServerList: "i_needed_modify_power_serverinstance_virtualserver_list";
    /** `i_needed_modify_power_serverinstance_binding_list`: The power needed to modify `b_serverinstance_binding_list`. */
    readonly NeededModifyPowerServerInstanceBindingList: "i_needed_modify_power_serverinstance_binding_list";
    /** `i_needed_modify_power_serverinstance_permission_list`: The power needed to modify `b_serverinstance_permission_list`. */
    readonly NeededModifyPowerServerInstancePermissionList: "i_needed_modify_power_serverinstance_permission_list";
    /** `i_needed_modify_power_serverinstance_permission_find`: The power needed to modify `b_serverinstance_permission_find`. */
    readonly NeededModifyPowerServerInstancePermissionFind: "i_needed_modify_power_serverinstance_permission_find";
    /** `i_needed_modify_power_virtualserver_create`: The power needed to modify `b_virtualserver_create`. */
    readonly NeededModifyPowerVirtualServerCreate: "i_needed_modify_power_virtualserver_create";
    /** `i_needed_modify_power_virtualserver_delete`: The power needed to modify `b_virtualserver_delete`. */
    readonly NeededModifyPowerVirtualServerDelete: "i_needed_modify_power_virtualserver_delete";
    /** `i_needed_modify_power_virtualserver_start_any`: The power needed to modify `b_virtualserver_start_any`. */
    readonly NeededModifyPowerVirtualServerStartAny: "i_needed_modify_power_virtualserver_start_any";
    /** `i_needed_modify_power_virtualserver_stop_any`: The power needed to modify `b_virtualserver_stop_any`. */
    readonly NeededModifyPowerVirtualServerStopAny: "i_needed_modify_power_virtualserver_stop_any";
    /** `i_needed_modify_power_virtualserver_change_machine_id`: The power needed to modify `b_virtualserver_change_machine_id`. */
    readonly NeededModifyPowerVirtualServerChangeMachineID: "i_needed_modify_power_virtualserver_change_machine_id";
    /** `i_needed_modify_power_virtualserver_change_template`: The power needed to modify `b_virtualserver_change_template`. */
    readonly NeededModifyPowerVirtualServerChangeTemplate: "i_needed_modify_power_virtualserver_change_template";
    /** `i_needed_modify_power_serverquery_login`: The power needed to modify `b_serverquery_login`. */
    readonly NeededModifyPowerServerQueryLogin: "i_needed_modify_power_serverquery_login";
    /** `i_needed_modify_power_serverquery_login_create`: The power needed to modify `b_serverquery_login_create`. */
    readonly NeededModifyPowerServerQueryLoginCreate: "i_needed_modify_power_serverquery_login_create";
    /** `i_needed_modify_power_serverquery_login_delete`: The power needed to modify `b_serverquery_login_delete`. */
    readonly NeededModifyPowerServerQueryLoginDelete: "i_needed_modify_power_serverquery_login_delete";
    /** `i_needed_modify_power_serverquery_login_list`: The power needed to modify `b_serverquery_login_list`. */
    readonly NeededModifyPowerServerQueryLoginList: "i_needed_modify_power_serverquery_login_list";
    /** `i_needed_modify_power_serverinstance_textmessage_send`: The power needed to modify `b_serverinstance_textmessage_send`. */
    readonly NeededModifyPowerServerInstanceTextMessageSend: "i_needed_modify_power_serverinstance_textmessage_send";
    /** `i_needed_modify_power_serverinstance_log_view`: The power needed to modify `b_serverinstance_log_view`. */
    readonly NeededModifyPowerServerInstanceLogView: "i_needed_modify_power_serverinstance_log_view";
    /** `i_needed_modify_power_serverinstance_log_add`: The power needed to modify `b_serverinstance_log_add`. */
    readonly NeededModifyPowerServerInstanceLogAdd: "i_needed_modify_power_serverinstance_log_add";
    /** `i_needed_modify_power_serverinstance_stop`: The power needed to modify `b_serverinstance_stop`. */
    readonly NeededModifyPowerServerInstanceStop: "i_needed_modify_power_serverinstance_stop";
    /** `i_needed_modify_power_serverinstance_licensesign_message`: The power needed to modify `b_serverinstance_licensesign_message`. TeamSpeak 6 only. */
    readonly NeededModifyPowerServerInstanceLicenseSignMessage: "i_needed_modify_power_serverinstance_licensesign_message";
    /** `i_needed_modify_power_serverinstance_modify_settings`: The power needed to modify `b_serverinstance_modify_settings`. */
    readonly NeededModifyPowerServerInstanceModifySettings: "i_needed_modify_power_serverinstance_modify_settings";
    /** `i_needed_modify_power_serverinstance_modify_querygroup`: The power needed to modify `b_serverinstance_modify_querygroup`. */
    readonly NeededModifyPowerServerInstanceModifyQueryGroup: "i_needed_modify_power_serverinstance_modify_querygroup";
    /** `i_needed_modify_power_serverinstance_modify_templates`: The power needed to modify `b_serverinstance_modify_templates`. */
    readonly NeededModifyPowerServerInstanceModifyTemplates: "i_needed_modify_power_serverinstance_modify_templates";
    /** `i_needed_modify_power_virtualserver_select`: The power needed to modify `b_virtualserver_select`. */
    readonly NeededModifyPowerVirtualServerSelect: "i_needed_modify_power_virtualserver_select";
    /** `i_needed_modify_power_virtualserver_info_view`: The power needed to modify `b_virtualserver_info_view`. */
    readonly NeededModifyPowerVirtualServerInfoView: "i_needed_modify_power_virtualserver_info_view";
    /** `i_needed_modify_power_virtualserver_connectioninfo_view`: The power needed to modify `b_virtualserver_connectioninfo_view`. */
    readonly NeededModifyPowerVirtualServerConnectionInfoView: "i_needed_modify_power_virtualserver_connectioninfo_view";
    /** `i_needed_modify_power_virtualserver_channel_list`: The power needed to modify `b_virtualserver_channel_list`. */
    readonly NeededModifyPowerVirtualServerChannelList: "i_needed_modify_power_virtualserver_channel_list";
    /** `i_needed_modify_power_virtualserver_channel_search`: The power needed to modify `b_virtualserver_channel_search`. */
    readonly NeededModifyPowerVirtualServerChannelSearch: "i_needed_modify_power_virtualserver_channel_search";
    /** `i_needed_modify_power_virtualserver_client_list`: The power needed to modify `b_virtualserver_client_list`. */
    readonly NeededModifyPowerVirtualServerClientList: "i_needed_modify_power_virtualserver_client_list";
    /** `i_needed_modify_power_virtualserver_client_search`: The power needed to modify `b_virtualserver_client_search`. */
    readonly NeededModifyPowerVirtualServerClientSearch: "i_needed_modify_power_virtualserver_client_search";
    /** `i_needed_modify_power_virtualserver_client_dblist`: The power needed to modify `b_virtualserver_client_dblist`. */
    readonly NeededModifyPowerVirtualServerClientDBList: "i_needed_modify_power_virtualserver_client_dblist";
    /** `i_needed_modify_power_virtualserver_client_dbsearch`: The power needed to modify `b_virtualserver_client_dbsearch`. */
    readonly NeededModifyPowerVirtualServerClientDBSearch: "i_needed_modify_power_virtualserver_client_dbsearch";
    /** `i_needed_modify_power_virtualserver_client_dbinfo`: The power needed to modify `b_virtualserver_client_dbinfo`. */
    readonly NeededModifyPowerVirtualServerClientDBInfo: "i_needed_modify_power_virtualserver_client_dbinfo";
    /** `i_needed_modify_power_virtualserver_permission_find`: The power needed to modify `b_virtualserver_permission_find`. */
    readonly NeededModifyPowerVirtualServerPermissionFind: "i_needed_modify_power_virtualserver_permission_find";
    /** `i_needed_modify_power_virtualserver_custom_search`: The power needed to modify `b_virtualserver_custom_search`. */
    readonly NeededModifyPowerVirtualServerCustomSearch: "i_needed_modify_power_virtualserver_custom_search";
    /** `i_needed_modify_power_virtualserver_start`: The power needed to modify `b_virtualserver_start`. */
    readonly NeededModifyPowerVirtualServerStart: "i_needed_modify_power_virtualserver_start";
    /** `i_needed_modify_power_virtualserver_stop`: The power needed to modify `b_virtualserver_stop`. */
    readonly NeededModifyPowerVirtualServerStop: "i_needed_modify_power_virtualserver_stop";
    /** `i_needed_modify_power_virtualserver_token_list`: The power needed to modify `b_virtualserver_token_list`. */
    readonly NeededModifyPowerVirtualServerTokenList: "i_needed_modify_power_virtualserver_token_list";
    /** `i_needed_modify_power_virtualserver_token_add`: The power needed to modify `b_virtualserver_token_add`. */
    readonly NeededModifyPowerVirtualServerTokenAdd: "i_needed_modify_power_virtualserver_token_add";
    /** `i_needed_modify_power_virtualserver_token_use`: The power needed to modify `b_virtualserver_token_use`. */
    readonly NeededModifyPowerVirtualServerTokenUse: "i_needed_modify_power_virtualserver_token_use";
    /** `i_needed_modify_power_virtualserver_token_delete`: The power needed to modify `b_virtualserver_token_delete`. */
    readonly NeededModifyPowerVirtualServerTokenDelete: "i_needed_modify_power_virtualserver_token_delete";
    /** `i_needed_modify_power_virtualserver_apikey_add`: The power needed to modify `b_virtualserver_apikey_add`. */
    readonly NeededModifyPowerVirtualServerAPIKeyAdd: "i_needed_modify_power_virtualserver_apikey_add";
    /** `i_needed_modify_power_virtualserver_apikey_manage`: The power needed to modify `b_virtualserver_apikey_manage`. */
    readonly NeededModifyPowerVirtualServerAPIKeyManage: "i_needed_modify_power_virtualserver_apikey_manage";
    /** `i_needed_modify_power_virtualserver_log_view`: The power needed to modify `b_virtualserver_log_view`. */
    readonly NeededModifyPowerVirtualServerLogView: "i_needed_modify_power_virtualserver_log_view";
    /** `i_needed_modify_power_virtualserver_log_add`: The power needed to modify `b_virtualserver_log_add`. */
    readonly NeededModifyPowerVirtualServerLogAdd: "i_needed_modify_power_virtualserver_log_add";
    /** `i_needed_modify_power_virtualserver_join_ignore_password`: The power needed to modify `b_virtualserver_join_ignore_password`. */
    readonly NeededModifyPowerVirtualServerJoinIgnorePassword: "i_needed_modify_power_virtualserver_join_ignore_password";
    /** `i_needed_modify_power_virtualserver_notify_register`: The power needed to modify `b_virtualserver_notify_register`. */
    readonly NeededModifyPowerVirtualServerNotifyRegister: "i_needed_modify_power_virtualserver_notify_register";
    /** `i_needed_modify_power_virtualserver_notify_unregister`: The power needed to modify `b_virtualserver_notify_unregister`. */
    readonly NeededModifyPowerVirtualServerNotifyUnregister: "i_needed_modify_power_virtualserver_notify_unregister";
    /** `i_needed_modify_power_virtualserver_snapshot_create`: The power needed to modify `b_virtualserver_snapshot_create`. */
    readonly NeededModifyPowerVirtualServerSnapshotCreate: "i_needed_modify_power_virtualserver_snapshot_create";
    /** `i_needed_modify_power_virtualserver_snapshot_deploy`: The power needed to modify `b_virtualserver_snapshot_deploy`. */
    readonly NeededModifyPowerVirtualServerSnapshotDeploy: "i_needed_modify_power_virtualserver_snapshot_deploy";
    /** `i_needed_modify_power_virtualserver_permission_reset`: The power needed to modify `b_virtualserver_permission_reset`. */
    readonly NeededModifyPowerVirtualServerPermissionReset: "i_needed_modify_power_virtualserver_permission_reset";
    /** `i_needed_modify_power_virtualserver_canonical_name_manage`: The power needed to modify `b_virtualserver_canonical_name_manage`. TeamSpeak 6 only. */
    readonly NeededModifyPowerVirtualServerCanonicalNameManage: "i_needed_modify_power_virtualserver_canonical_name_manage";
    /** `i_needed_modify_power_virtualserver_modify_name`: The power needed to modify `b_virtualserver_modify_name`. */
    readonly NeededModifyPowerVirtualServerModifyName: "i_needed_modify_power_virtualserver_modify_name";
    /** `i_needed_modify_power_virtualserver_modify_welcomemessage`: The power needed to modify `b_virtualserver_modify_welcomemessage`. */
    readonly NeededModifyPowerVirtualServerModifyWelcomeMessage: "i_needed_modify_power_virtualserver_modify_welcomemessage";
    /** `i_needed_modify_power_virtualserver_modify_maxclients`: The power needed to modify `b_virtualserver_modify_maxclients`. */
    readonly NeededModifyPowerVirtualServerModifyMaxClients: "i_needed_modify_power_virtualserver_modify_maxclients";
    /** `i_needed_modify_power_virtualserver_modify_reserved_slots`: The power needed to modify `b_virtualserver_modify_reserved_slots`. */
    readonly NeededModifyPowerVirtualServerModifyReservedSlots: "i_needed_modify_power_virtualserver_modify_reserved_slots";
    /** `i_needed_modify_power_virtualserver_modify_password`: The power needed to modify `b_virtualserver_modify_password`. */
    readonly NeededModifyPowerVirtualServerModifyPassword: "i_needed_modify_power_virtualserver_modify_password";
    /** `i_needed_modify_power_virtualserver_modify_default_servergroup`: The power needed to modify `b_virtualserver_modify_default_servergroup`. */
    readonly NeededModifyPowerVirtualServerModifyDefaultServerGroup: "i_needed_modify_power_virtualserver_modify_default_servergroup";
    /** `i_needed_modify_power_virtualserver_modify_default_channelgroup`: The power needed to modify `b_virtualserver_modify_default_channelgroup`. */
    readonly NeededModifyPowerVirtualServerModifyDefaultChannelGroup: "i_needed_modify_power_virtualserver_modify_default_channelgroup";
    /** `i_needed_modify_power_virtualserver_modify_default_channeladmingroup`: The power needed to modify `b_virtualserver_modify_default_channeladmingroup`. */
    readonly NeededModifyPowerVirtualServerModifyDefaultChannelAdminGroup: "i_needed_modify_power_virtualserver_modify_default_channeladmingroup";
    /** `i_needed_modify_power_virtualserver_modify_channel_forced_silence`: The power needed to modify `b_virtualserver_modify_channel_forced_silence`. */
    readonly NeededModifyPowerVirtualServerModifyChannelForcedSilence: "i_needed_modify_power_virtualserver_modify_channel_forced_silence";
    /** `i_needed_modify_power_virtualserver_modify_complain`: The power needed to modify `b_virtualserver_modify_complain`. */
    readonly NeededModifyPowerVirtualServerModifyComplain: "i_needed_modify_power_virtualserver_modify_complain";
    /** `i_needed_modify_power_virtualserver_modify_antiflood`: The power needed to modify `b_virtualserver_modify_antiflood`. */
    readonly NeededModifyPowerVirtualServerModifyAntiflood: "i_needed_modify_power_virtualserver_modify_antiflood";
    /** `i_needed_modify_power_virtualserver_modify_ft_settings`: The power needed to modify `b_virtualserver_modify_ft_settings`. */
    readonly NeededModifyPowerVirtualServerModifyFTSettings: "i_needed_modify_power_virtualserver_modify_ft_settings";
    /** `i_needed_modify_power_virtualserver_modify_ft_quotas`: The power needed to modify `b_virtualserver_modify_ft_quotas`. */
    readonly NeededModifyPowerVirtualServerModifyFTQuotas: "i_needed_modify_power_virtualserver_modify_ft_quotas";
    /** `i_needed_modify_power_virtualserver_modify_hostmessage`: The power needed to modify `b_virtualserver_modify_hostmessage`. */
    readonly NeededModifyPowerVirtualServerModifyHostMessage: "i_needed_modify_power_virtualserver_modify_hostmessage";
    /** `i_needed_modify_power_virtualserver_modify_hostbanner`: The power needed to modify `b_virtualserver_modify_hostbanner`. */
    readonly NeededModifyPowerVirtualServerModifyHostBanner: "i_needed_modify_power_virtualserver_modify_hostbanner";
    /** `i_needed_modify_power_virtualserver_modify_hostbutton`: The power needed to modify `b_virtualserver_modify_hostbutton`. */
    readonly NeededModifyPowerVirtualServerModifyHostButton: "i_needed_modify_power_virtualserver_modify_hostbutton";
    /** `i_needed_modify_power_virtualserver_modify_port`: The power needed to modify `b_virtualserver_modify_port`. */
    readonly NeededModifyPowerVirtualServerModifyPort: "i_needed_modify_power_virtualserver_modify_port";
    /** `i_needed_modify_power_virtualserver_modify_autostart`: The power needed to modify `b_virtualserver_modify_autostart`. */
    readonly NeededModifyPowerVirtualServerModifyAutoStart: "i_needed_modify_power_virtualserver_modify_autostart";
    /** `i_needed_modify_power_virtualserver_modify_needed_identity_security_level`: The power needed to modify `b_virtualserver_modify_needed_identity_security_level`. */
    readonly NeededModifyPowerVirtualServerModifyNeededIdentitySecurityLevel: "i_needed_modify_power_virtualserver_modify_needed_identity_security_level";
    /** `i_needed_modify_power_virtualserver_modify_priority_speaker_dimm_modificator`: The power needed to modify `b_virtualserver_modify_priority_speaker_dimm_modificator`. */
    readonly NeededModifyPowerVirtualServerModifyPrioritySpeakerDimmModificator: "i_needed_modify_power_virtualserver_modify_priority_speaker_dimm_modificator";
    /** `i_needed_modify_power_virtualserver_modify_log_settings`: The power needed to modify `b_virtualserver_modify_log_settings`. */
    readonly NeededModifyPowerVirtualServerModifyLogSettings: "i_needed_modify_power_virtualserver_modify_log_settings";
    /** `i_needed_modify_power_virtualserver_modify_min_client_version`: The power needed to modify `b_virtualserver_modify_min_client_version`. */
    readonly NeededModifyPowerVirtualServerModifyMinClientVersion: "i_needed_modify_power_virtualserver_modify_min_client_version";
    /** `i_needed_modify_power_virtualserver_modify_icon_id`: The power needed to modify `b_virtualserver_modify_icon_id`. */
    readonly NeededModifyPowerVirtualServerModifyIconID: "i_needed_modify_power_virtualserver_modify_icon_id";
    /** `i_needed_modify_power_virtualserver_modify_weblist`: The power needed to modify `b_virtualserver_modify_weblist`. */
    readonly NeededModifyPowerVirtualServerModifyWebList: "i_needed_modify_power_virtualserver_modify_weblist";
    /** `i_needed_modify_power_virtualserver_modify_codec_encryption_mode`: The power needed to modify `b_virtualserver_modify_codec_encryption_mode`. */
    readonly NeededModifyPowerVirtualServerModifyCodecEncryptionMode: "i_needed_modify_power_virtualserver_modify_codec_encryption_mode";
    /** `i_needed_modify_power_virtualserver_modify_temporary_passwords`: The power needed to modify `b_virtualserver_modify_temporary_passwords`. */
    readonly NeededModifyPowerVirtualServerModifyTemporaryPasswords: "i_needed_modify_power_virtualserver_modify_temporary_passwords";
    /** `i_needed_modify_power_virtualserver_modify_temporary_passwords_own`: The power needed to modify `b_virtualserver_modify_temporary_passwords_own`. */
    readonly NeededModifyPowerVirtualServerModifyTemporaryPasswordsOwn: "i_needed_modify_power_virtualserver_modify_temporary_passwords_own";
    /** `i_needed_modify_power_virtualserver_modify_channel_temp_delete_delay_default`: The power needed to modify `b_virtualserver_modify_channel_temp_delete_delay_default`. */
    readonly NeededModifyPowerVirtualServerModifyChannelTempDeleteDelayDefault: "i_needed_modify_power_virtualserver_modify_channel_temp_delete_delay_default";
    /** `i_needed_modify_power_virtualserver_modify_nickname`: The power needed to modify `b_virtualserver_modify_nickname`. */
    readonly NeededModifyPowerVirtualServerModifyNickname: "i_needed_modify_power_virtualserver_modify_nickname";
    /** `i_needed_modify_power_virtualserver_modify_integrations`: The power needed to modify `b_virtualserver_modify_integrations`. */
    readonly NeededModifyPowerVirtualServerModifyIntegrations: "i_needed_modify_power_virtualserver_modify_integrations";
    /** `i_needed_modify_power_virtualserver_modify_mytsid_connect`: The power needed to modify `b_virtualserver_modify_mytsid_connect`. TeamSpeak 6 only. */
    readonly NeededModifyPowerVirtualServerModifyMyTSIDConnect: "i_needed_modify_power_virtualserver_modify_mytsid_connect";
    /** `i_needed_modify_power_channel_min_depth`: The power needed to modify `i_channel_min_depth`. */
    readonly NeededModifyPowerChannelMinDepth: "i_needed_modify_power_channel_min_depth";
    /** `i_needed_modify_power_channel_max_depth`: The power needed to modify `i_channel_max_depth`. */
    readonly NeededModifyPowerChannelMaxDepth: "i_needed_modify_power_channel_max_depth";
    /** `i_needed_modify_power_channel_group_inheritance_end`: The power needed to modify `b_channel_group_inheritance_end`. */
    readonly NeededModifyPowerChannelGroupInheritanceEnd: "i_needed_modify_power_channel_group_inheritance_end";
    /** `i_needed_modify_power_channel_permission_modify_power`: The power needed to modify `i_channel_permission_modify_power`. */
    readonly NeededModifyPowerChannelPermissionModifyPower: "i_needed_modify_power_channel_permission_modify_power";
    /** `i_needed_modify_power_channel_needed_permission_modify_power`: The power needed to modify `i_channel_needed_permission_modify_power`. */
    readonly NeededModifyPowerChannelNeededPermissionModifyPower: "i_needed_modify_power_channel_needed_permission_modify_power";
    /** `i_needed_modify_power_channel_info_view`: The power needed to modify `b_channel_info_view`. */
    readonly NeededModifyPowerChannelInfoView: "i_needed_modify_power_channel_info_view";
    /** `i_needed_modify_power_channel_create_child`: The power needed to modify `b_channel_create_child`. */
    readonly NeededModifyPowerChannelCreateChild: "i_needed_modify_power_channel_create_child";
    /** `i_needed_modify_power_channel_create_permanent`: The power needed to modify `b_channel_create_permanent`. */
    readonly NeededModifyPowerChannelCreatePermanent: "i_needed_modify_power_channel_create_permanent";
    /** `i_needed_modify_power_channel_create_semi_permanent`: The power needed to modify `b_channel_create_semi_permanent`. */
    readonly NeededModifyPowerChannelCreateSemiPermanent: "i_needed_modify_power_channel_create_semi_permanent";
    /** `i_needed_modify_power_channel_create_temporary`: The power needed to modify `b_channel_create_temporary`. */
    readonly NeededModifyPowerChannelCreateTemporary: "i_needed_modify_power_channel_create_temporary";
    /** `i_needed_modify_power_channel_create_with_topic`: The power needed to modify `b_channel_create_with_topic`. */
    readonly NeededModifyPowerChannelCreateWithTopic: "i_needed_modify_power_channel_create_with_topic";
    /** `i_needed_modify_power_channel_create_with_description`: The power needed to modify `b_channel_create_with_description`. */
    readonly NeededModifyPowerChannelCreateWithDescription: "i_needed_modify_power_channel_create_with_description";
    /** `i_needed_modify_power_channel_create_with_password`: The power needed to modify `b_channel_create_with_password`. */
    readonly NeededModifyPowerChannelCreateWithPassword: "i_needed_modify_power_channel_create_with_password";
    /** `i_needed_modify_power_channel_create_with_banner`: The power needed to modify `b_channel_create_with_banner`. */
    readonly NeededModifyPowerChannelCreateWithBanner: "i_needed_modify_power_channel_create_with_banner";
    /** `i_needed_modify_power_channel_create_modify_with_codec_opusvoice`: The power needed to modify `b_channel_create_modify_with_codec_opusvoice`. */
    readonly NeededModifyPowerChannelCreateModifyWithCodecOpusVoice: "i_needed_modify_power_channel_create_modify_with_codec_opusvoice";
    /** `i_needed_modify_power_channel_create_modify_with_codec_opusmusic`: The power needed to modify `b_channel_create_modify_with_codec_opusmusic`. */
    readonly NeededModifyPowerChannelCreateModifyWithCodecOpusMusic: "i_needed_modify_power_channel_create_modify_with_codec_opusmusic";
    /** `i_needed_modify_power_channel_create_modify_with_codec_maxquality`: The power needed to modify `i_channel_create_modify_with_codec_maxquality`. */
    readonly NeededModifyPowerChannelCreateModifyWithCodecMaxQuality: "i_needed_modify_power_channel_create_modify_with_codec_maxquality";
    /** `i_needed_modify_power_channel_create_modify_with_codec_latency_factor_min`: The power needed to modify `i_channel_create_modify_with_codec_latency_factor_min`. */
    readonly NeededModifyPowerChannelCreateModifyWithCodecLatencyFactorMin: "i_needed_modify_power_channel_create_modify_with_codec_latency_factor_min";
    /** `i_needed_modify_power_channel_create_with_maxclients`: The power needed to modify `b_channel_create_with_maxclients`. */
    readonly NeededModifyPowerChannelCreateWithMaxClients: "i_needed_modify_power_channel_create_with_maxclients";
    /** `i_needed_modify_power_channel_create_with_maxfamilyclients`: The power needed to modify `b_channel_create_with_maxfamilyclients`. */
    readonly NeededModifyPowerChannelCreateWithMaxFamilyClients: "i_needed_modify_power_channel_create_with_maxfamilyclients";
    /** `i_needed_modify_power_channel_create_with_sortorder`: The power needed to modify `b_channel_create_with_sortorder`. */
    readonly NeededModifyPowerChannelCreateWithSortOrder: "i_needed_modify_power_channel_create_with_sortorder";
    /** `i_needed_modify_power_channel_create_with_default`: The power needed to modify `b_channel_create_with_default`. */
    readonly NeededModifyPowerChannelCreateWithDefault: "i_needed_modify_power_channel_create_with_default";
    /** `i_needed_modify_power_channel_create_with_needed_talk_power`: The power needed to modify `b_channel_create_with_needed_talk_power`. */
    readonly NeededModifyPowerChannelCreateWithNeededTalkPower: "i_needed_modify_power_channel_create_with_needed_talk_power";
    /** `i_needed_modify_power_channel_create_modify_with_force_password`: The power needed to modify `b_channel_create_modify_with_force_password`. */
    readonly NeededModifyPowerChannelCreateModifyWithForcePassword: "i_needed_modify_power_channel_create_modify_with_force_password";
    /** `i_needed_modify_power_channel_create_modify_with_temp_delete_delay`: The power needed to modify `i_channel_create_modify_with_temp_delete_delay`. */
    readonly NeededModifyPowerChannelCreateModifyWithTempDeleteDelay: "i_needed_modify_power_channel_create_modify_with_temp_delete_delay";
    /** `i_needed_modify_power_channel_modify_parent`: The power needed to modify `b_channel_modify_parent`. */
    readonly NeededModifyPowerChannelModifyParent: "i_needed_modify_power_channel_modify_parent";
    /** `i_needed_modify_power_channel_modify_make_default`: The power needed to modify `b_channel_modify_make_default`. */
    readonly NeededModifyPowerChannelModifyMakeDefault: "i_needed_modify_power_channel_modify_make_default";
    /** `i_needed_modify_power_channel_modify_make_permanent`: The power needed to modify `b_channel_modify_make_permanent`. */
    readonly NeededModifyPowerChannelModifyMakePermanent: "i_needed_modify_power_channel_modify_make_permanent";
    /** `i_needed_modify_power_channel_modify_make_semi_permanent`: The power needed to modify `b_channel_modify_make_semi_permanent`. */
    readonly NeededModifyPowerChannelModifyMakeSemiPermanent: "i_needed_modify_power_channel_modify_make_semi_permanent";
    /** `i_needed_modify_power_channel_modify_make_temporary`: The power needed to modify `b_channel_modify_make_temporary`. */
    readonly NeededModifyPowerChannelModifyMakeTemporary: "i_needed_modify_power_channel_modify_make_temporary";
    /** `i_needed_modify_power_channel_modify_name`: The power needed to modify `b_channel_modify_name`. */
    readonly NeededModifyPowerChannelModifyName: "i_needed_modify_power_channel_modify_name";
    /** `i_needed_modify_power_channel_modify_topic`: The power needed to modify `b_channel_modify_topic`. */
    readonly NeededModifyPowerChannelModifyTopic: "i_needed_modify_power_channel_modify_topic";
    /** `i_needed_modify_power_channel_modify_description`: The power needed to modify `b_channel_modify_description`. */
    readonly NeededModifyPowerChannelModifyDescription: "i_needed_modify_power_channel_modify_description";
    /** `i_needed_modify_power_channel_modify_password`: The power needed to modify `b_channel_modify_password`. */
    readonly NeededModifyPowerChannelModifyPassword: "i_needed_modify_power_channel_modify_password";
    /** `i_needed_modify_power_channel_modify_banner`: The power needed to modify `b_channel_modify_banner`. */
    readonly NeededModifyPowerChannelModifyBanner: "i_needed_modify_power_channel_modify_banner";
    /** `i_needed_modify_power_channel_modify_codec`: The power needed to modify `b_channel_modify_codec`. */
    readonly NeededModifyPowerChannelModifyCodec: "i_needed_modify_power_channel_modify_codec";
    /** `i_needed_modify_power_channel_modify_codec_quality`: The power needed to modify `b_channel_modify_codec_quality`. */
    readonly NeededModifyPowerChannelModifyCodecQuality: "i_needed_modify_power_channel_modify_codec_quality";
    /** `i_needed_modify_power_channel_modify_codec_latency_factor`: The power needed to modify `b_channel_modify_codec_latency_factor`. */
    readonly NeededModifyPowerChannelModifyCodecLatencyFactor: "i_needed_modify_power_channel_modify_codec_latency_factor";
    /** `i_needed_modify_power_channel_modify_maxclients`: The power needed to modify `b_channel_modify_maxclients`. */
    readonly NeededModifyPowerChannelModifyMaxClients: "i_needed_modify_power_channel_modify_maxclients";
    /** `i_needed_modify_power_channel_modify_maxfamilyclients`: The power needed to modify `b_channel_modify_maxfamilyclients`. */
    readonly NeededModifyPowerChannelModifyMaxFamilyClients: "i_needed_modify_power_channel_modify_maxfamilyclients";
    /** `i_needed_modify_power_channel_modify_sortorder`: The power needed to modify `b_channel_modify_sortorder`. */
    readonly NeededModifyPowerChannelModifySortOrder: "i_needed_modify_power_channel_modify_sortorder";
    /** `i_needed_modify_power_channel_modify_needed_talk_power`: The power needed to modify `b_channel_modify_needed_talk_power`. */
    readonly NeededModifyPowerChannelModifyNeededTalkPower: "i_needed_modify_power_channel_modify_needed_talk_power";
    /** `i_needed_modify_power_channel_modify_power`: The power needed to modify `i_channel_modify_power`. */
    readonly NeededModifyPowerChannelModifyPower: "i_needed_modify_power_channel_modify_power";
    /** `i_needed_modify_power_channel_needed_modify_power`: The power needed to modify `i_channel_needed_modify_power`. */
    readonly NeededModifyPowerChannelNeededModifyPower: "i_needed_modify_power_channel_needed_modify_power";
    /** `i_needed_modify_power_channel_modify_make_codec_encrypted`: The power needed to modify `b_channel_modify_make_codec_encrypted`. */
    readonly NeededModifyPowerChannelModifyMakeCodecEncrypted: "i_needed_modify_power_channel_modify_make_codec_encrypted";
    /** `i_needed_modify_power_channel_modify_temp_delete_delay`: The power needed to modify `b_channel_modify_temp_delete_delay`. */
    readonly NeededModifyPowerChannelModifyTempDeleteDelay: "i_needed_modify_power_channel_modify_temp_delete_delay";
    /** `i_needed_modify_power_channel_modify_ft_quotas`: The power needed to modify `b_channel_modify_ft_quotas`. TeamSpeak 6 only. */
    readonly NeededModifyPowerChannelModifyFTQuotas: "i_needed_modify_power_channel_modify_ft_quotas";
    /** `i_needed_modify_power_channel_delete_permanent`: The power needed to modify `b_channel_delete_permanent`. */
    readonly NeededModifyPowerChannelDeletePermanent: "i_needed_modify_power_channel_delete_permanent";
    /** `i_needed_modify_power_channel_delete_semi_permanent`: The power needed to modify `b_channel_delete_semi_permanent`. */
    readonly NeededModifyPowerChannelDeleteSemiPermanent: "i_needed_modify_power_channel_delete_semi_permanent";
    /** `i_needed_modify_power_channel_delete_temporary`: The power needed to modify `b_channel_delete_temporary`. */
    readonly NeededModifyPowerChannelDeleteTemporary: "i_needed_modify_power_channel_delete_temporary";
    /** `i_needed_modify_power_channel_delete_flag_force`: The power needed to modify `b_channel_delete_flag_force`. */
    readonly NeededModifyPowerChannelDeleteFlagForce: "i_needed_modify_power_channel_delete_flag_force";
    /** `i_needed_modify_power_channel_delete_power`: The power needed to modify `i_channel_delete_power`. */
    readonly NeededModifyPowerChannelDeletePower: "i_needed_modify_power_channel_delete_power";
    /** `i_needed_modify_power_channel_needed_delete_power`: The power needed to modify `i_channel_needed_delete_power`. */
    readonly NeededModifyPowerChannelNeededDeletePower: "i_needed_modify_power_channel_needed_delete_power";
    /** `i_needed_modify_power_channel_join_permanent`: The power needed to modify `b_channel_join_permanent`. */
    readonly NeededModifyPowerChannelJoinPermanent: "i_needed_modify_power_channel_join_permanent";
    /** `i_needed_modify_power_channel_join_semi_permanent`: The power needed to modify `b_channel_join_semi_permanent`. */
    readonly NeededModifyPowerChannelJoinSemiPermanent: "i_needed_modify_power_channel_join_semi_permanent";
    /** `i_needed_modify_power_channel_join_temporary`: The power needed to modify `b_channel_join_temporary`. */
    readonly NeededModifyPowerChannelJoinTemporary: "i_needed_modify_power_channel_join_temporary";
    /** `i_needed_modify_power_channel_join_ignore_password`: The power needed to modify `b_channel_join_ignore_password`. */
    readonly NeededModifyPowerChannelJoinIgnorePassword: "i_needed_modify_power_channel_join_ignore_password";
    /** `i_needed_modify_power_channel_join_ignore_maxclients`: The power needed to modify `b_channel_join_ignore_maxclients`. */
    readonly NeededModifyPowerChannelJoinIgnoreMaxClients: "i_needed_modify_power_channel_join_ignore_maxclients";
    /** `i_needed_modify_power_channel_join_power`: The power needed to modify `i_channel_join_power`. */
    readonly NeededModifyPowerChannelJoinPower: "i_needed_modify_power_channel_join_power";
    /** `i_needed_modify_power_channel_needed_join_power`: The power needed to modify `i_channel_needed_join_power`. */
    readonly NeededModifyPowerChannelNeededJoinPower: "i_needed_modify_power_channel_needed_join_power";
    /** `i_needed_modify_power_channel_subscribe_power`: The power needed to modify `i_channel_subscribe_power`. */
    readonly NeededModifyPowerChannelSubscribePower: "i_needed_modify_power_channel_subscribe_power";
    /** `i_needed_modify_power_channel_needed_subscribe_power`: The power needed to modify `i_channel_needed_subscribe_power`. */
    readonly NeededModifyPowerChannelNeededSubscribePower: "i_needed_modify_power_channel_needed_subscribe_power";
    /** `i_needed_modify_power_channel_description_view_power`: The power needed to modify `i_channel_description_view_power`. */
    readonly NeededModifyPowerChannelDescriptionViewPower: "i_needed_modify_power_channel_description_view_power";
    /** `i_needed_modify_power_channel_needed_description_view_power`: The power needed to modify `i_channel_needed_description_view_power`. */
    readonly NeededModifyPowerChannelNeededDescriptionViewPower: "i_needed_modify_power_channel_needed_description_view_power";
    /** `i_needed_modify_power_icon_id`: The power needed to modify `i_icon_id`. */
    readonly NeededModifyPowerIconID: "i_needed_modify_power_icon_id";
    /** `i_needed_modify_power_max_icon_filesize`: The power needed to modify `i_max_icon_filesize`. */
    readonly NeededModifyPowerMaxIconFileSize: "i_needed_modify_power_max_icon_filesize";
    /** `i_needed_modify_power_icon_manage`: The power needed to modify `b_icon_manage`. */
    readonly NeededModifyPowerIconManage: "i_needed_modify_power_icon_manage";
    /** `i_needed_modify_power_group_is_permanent`: The power needed to modify `b_group_is_permanent`. */
    readonly NeededModifyPowerGroupIsPermanent: "i_needed_modify_power_group_is_permanent";
    /** `i_needed_modify_power_group_auto_update_type`: The power needed to modify `i_group_auto_update_type`. */
    readonly NeededModifyPowerGroupAutoUpdateType: "i_needed_modify_power_group_auto_update_type";
    /** `i_needed_modify_power_group_auto_update_max_value`: The power needed to modify `i_group_auto_update_max_value`. */
    readonly NeededModifyPowerGroupAutoUpdateMaxValue: "i_needed_modify_power_group_auto_update_max_value";
    /** `i_needed_modify_power_group_sort_id`: The power needed to modify `i_group_sort_id`. */
    readonly NeededModifyPowerGroupSortID: "i_needed_modify_power_group_sort_id";
    /** `i_needed_modify_power_group_show_name_in_tree`: The power needed to modify `i_group_show_name_in_tree`. */
    readonly NeededModifyPowerGroupShowNameInTree: "i_needed_modify_power_group_show_name_in_tree";
    /** `i_needed_modify_power_virtualserver_servergroup_list`: The power needed to modify `b_virtualserver_servergroup_list`. */
    readonly NeededModifyPowerVirtualServerServerGroupList: "i_needed_modify_power_virtualserver_servergroup_list";
    /** `i_needed_modify_power_virtualserver_servergroup_permission_list`: The power needed to modify `b_virtualserver_servergroup_permission_list`. */
    readonly NeededModifyPowerVirtualServerServerGroupPermissionList: "i_needed_modify_power_virtualserver_servergroup_permission_list";
    /** `i_needed_modify_power_virtualserver_servergroup_client_list`: The power needed to modify `b_virtualserver_servergroup_client_list`. */
    readonly NeededModifyPowerVirtualServerServerGroupClientList: "i_needed_modify_power_virtualserver_servergroup_client_list";
    /** `i_needed_modify_power_virtualserver_channelgroup_list`: The power needed to modify `b_virtualserver_channelgroup_list`. */
    readonly NeededModifyPowerVirtualServerChannelGroupList: "i_needed_modify_power_virtualserver_channelgroup_list";
    /** `i_needed_modify_power_virtualserver_channelgroup_permission_list`: The power needed to modify `b_virtualserver_channelgroup_permission_list`. */
    readonly NeededModifyPowerVirtualServerChannelGroupPermissionList: "i_needed_modify_power_virtualserver_channelgroup_permission_list";
    /** `i_needed_modify_power_virtualserver_channelgroup_client_list`: The power needed to modify `b_virtualserver_channelgroup_client_list`. */
    readonly NeededModifyPowerVirtualServerChannelGroupClientList: "i_needed_modify_power_virtualserver_channelgroup_client_list";
    /** `i_needed_modify_power_virtualserver_client_permission_list`: The power needed to modify `b_virtualserver_client_permission_list`. */
    readonly NeededModifyPowerVirtualServerClientPermissionList: "i_needed_modify_power_virtualserver_client_permission_list";
    /** `i_needed_modify_power_virtualserver_channel_permission_list`: The power needed to modify `b_virtualserver_channel_permission_list`. */
    readonly NeededModifyPowerVirtualServerChannelPermissionList: "i_needed_modify_power_virtualserver_channel_permission_list";
    /** `i_needed_modify_power_virtualserver_channelclient_permission_list`: The power needed to modify `b_virtualserver_channelclient_permission_list`. */
    readonly NeededModifyPowerVirtualServerChannelClientPermissionList: "i_needed_modify_power_virtualserver_channelclient_permission_list";
    /** `i_needed_modify_power_virtualserver_servergroup_create`: The power needed to modify `b_virtualserver_servergroup_create`. */
    readonly NeededModifyPowerVirtualServerServerGroupCreate: "i_needed_modify_power_virtualserver_servergroup_create";
    /** `i_needed_modify_power_virtualserver_channelgroup_create`: The power needed to modify `b_virtualserver_channelgroup_create`. */
    readonly NeededModifyPowerVirtualServerChannelGroupCreate: "i_needed_modify_power_virtualserver_channelgroup_create";
    /** `i_needed_modify_power_group_modify_power`: The power needed to modify `i_group_modify_power`. */
    readonly NeededModifyPowerGroupModifyPower: "i_needed_modify_power_group_modify_power";
    /** `i_needed_modify_power_group_needed_modify_power`: The power needed to modify `i_group_needed_modify_power`. */
    readonly NeededModifyPowerGroupNeededModifyPower: "i_needed_modify_power_group_needed_modify_power";
    /** `i_needed_modify_power_group_member_add_power`: The power needed to modify `i_group_member_add_power`. */
    readonly NeededModifyPowerGroupMemberAddPower: "i_needed_modify_power_group_member_add_power";
    /** `i_needed_modify_power_group_needed_member_add_power`: The power needed to modify `i_group_needed_member_add_power`. */
    readonly NeededModifyPowerGroupNeededMemberAddPower: "i_needed_modify_power_group_needed_member_add_power";
    /** `i_needed_modify_power_group_member_remove_power`: The power needed to modify `i_group_member_remove_power`. */
    readonly NeededModifyPowerGroupMemberRemovePower: "i_needed_modify_power_group_member_remove_power";
    /** `i_needed_modify_power_group_needed_member_remove_power`: The power needed to modify `i_group_needed_member_remove_power`. */
    readonly NeededModifyPowerGroupNeededMemberRemovePower: "i_needed_modify_power_group_needed_member_remove_power";
    /** `i_needed_modify_power_permission_modify_power`: The power needed to modify `i_permission_modify_power`. */
    readonly NeededModifyPowerPermissionModifyPower: "i_needed_modify_power_permission_modify_power";
    /** `i_needed_modify_power_permission_modify_power_ignore`: The power needed to modify `b_permission_modify_power_ignore`. */
    readonly NeededModifyPowerPermissionModifyPowerIgnore: "i_needed_modify_power_permission_modify_power_ignore";
    /** `i_needed_modify_power_virtualserver_servergroup_delete`: The power needed to modify `b_virtualserver_servergroup_delete`. */
    readonly NeededModifyPowerVirtualServerServerGroupDelete: "i_needed_modify_power_virtualserver_servergroup_delete";
    /** `i_needed_modify_power_virtualserver_channelgroup_delete`: The power needed to modify `b_virtualserver_channelgroup_delete`. */
    readonly NeededModifyPowerVirtualServerChannelGroupDelete: "i_needed_modify_power_virtualserver_channelgroup_delete";
    /** `i_needed_modify_power_client_permission_modify_power`: The power needed to modify `i_client_permission_modify_power`. */
    readonly NeededModifyPowerClientPermissionModifyPower: "i_needed_modify_power_client_permission_modify_power";
    /** `i_needed_modify_power_client_needed_permission_modify_power`: The power needed to modify `i_client_needed_permission_modify_power`. */
    readonly NeededModifyPowerClientNeededPermissionModifyPower: "i_needed_modify_power_client_needed_permission_modify_power";
    /** `i_needed_modify_power_client_max_clones_uid`: The power needed to modify `i_client_max_clones_uid`. */
    readonly NeededModifyPowerClientMaxClonesUID: "i_needed_modify_power_client_max_clones_uid";
    /** `i_needed_modify_power_client_max_idletime`: The power needed to modify `i_client_max_idletime`. */
    readonly NeededModifyPowerClientMaxIdleTime: "i_needed_modify_power_client_max_idletime";
    /** `i_needed_modify_power_client_max_avatar_filesize`: The power needed to modify `i_client_max_avatar_filesize`. */
    readonly NeededModifyPowerClientMaxAvatarFileSize: "i_needed_modify_power_client_max_avatar_filesize";
    /** `i_needed_modify_power_client_max_channel_subscriptions`: The power needed to modify `i_client_max_channel_subscriptions`. */
    readonly NeededModifyPowerClientMaxChannelSubscriptions: "i_needed_modify_power_client_max_channel_subscriptions";
    /** `i_needed_modify_power_client_is_priority_speaker`: The power needed to modify `b_client_is_priority_speaker`. */
    readonly NeededModifyPowerClientIsPrioritySpeaker: "i_needed_modify_power_client_is_priority_speaker";
    /** `i_needed_modify_power_client_skip_channelgroup_permissions`: The power needed to modify `b_client_skip_channelgroup_permissions`. */
    readonly NeededModifyPowerClientSkipChannelGroupPermissions: "i_needed_modify_power_client_skip_channelgroup_permissions";
    /** `i_needed_modify_power_client_force_push_to_talk`: The power needed to modify `b_client_force_push_to_talk`. */
    readonly NeededModifyPowerClientForcePushToTalk: "i_needed_modify_power_client_force_push_to_talk";
    /** `i_needed_modify_power_client_ignore_bans`: The power needed to modify `b_client_ignore_bans`. */
    readonly NeededModifyPowerClientIgnoreBans: "i_needed_modify_power_client_ignore_bans";
    /** `i_needed_modify_power_client_ignore_antiflood`: The power needed to modify `b_client_ignore_antiflood`. */
    readonly NeededModifyPowerClientIgnoreAntiflood: "i_needed_modify_power_client_ignore_antiflood";
    /** `i_needed_modify_power_client_use_reserved_slot`: The power needed to modify `b_client_use_reserved_slot`. */
    readonly NeededModifyPowerClientUseReservedSlot: "i_needed_modify_power_client_use_reserved_slot";
    /** `i_needed_modify_power_client_use_channel_commander`: The power needed to modify `b_client_use_channel_commander`. */
    readonly NeededModifyPowerClientUseChannelCommander: "i_needed_modify_power_client_use_channel_commander";
    /** `i_needed_modify_power_client_request_talker`: The power needed to modify `b_client_request_talker`. */
    readonly NeededModifyPowerClientRequestTalker: "i_needed_modify_power_client_request_talker";
    /** `i_needed_modify_power_client_avatar_delete_other`: The power needed to modify `b_client_avatar_delete_other`. */
    readonly NeededModifyPowerClientAvatarDeleteOther: "i_needed_modify_power_client_avatar_delete_other";
    /** `i_needed_modify_power_client_is_sticky`: The power needed to modify `b_client_is_sticky`. */
    readonly NeededModifyPowerClientIsSticky: "i_needed_modify_power_client_is_sticky";
    /** `i_needed_modify_power_client_ignore_sticky`: The power needed to modify `b_client_ignore_sticky`. */
    readonly NeededModifyPowerClientIgnoreSticky: "i_needed_modify_power_client_ignore_sticky";
    /** `i_needed_modify_power_client_info_view`: The power needed to modify `b_client_info_view`. */
    readonly NeededModifyPowerClientInfoView: "i_needed_modify_power_client_info_view";
    /** `i_needed_modify_power_client_permissionoverview_view`: The power needed to modify `b_client_permissionoverview_view`. */
    readonly NeededModifyPowerClientPermissionOverviewView: "i_needed_modify_power_client_permissionoverview_view";
    /** `i_needed_modify_power_client_permissionoverview_own`: The power needed to modify `b_client_permissionoverview_own`. */
    readonly NeededModifyPowerClientPermissionOverviewOwn: "i_needed_modify_power_client_permissionoverview_own";
    /** `i_needed_modify_power_client_remoteaddress_view`: The power needed to modify `b_client_remoteaddress_view`. */
    readonly NeededModifyPowerClientRemoteAddressView: "i_needed_modify_power_client_remoteaddress_view";
    /** `i_needed_modify_power_client_serverquery_view_power`: The power needed to modify `i_client_serverquery_view_power`. */
    readonly NeededModifyPowerClientServerQueryViewPower: "i_needed_modify_power_client_serverquery_view_power";
    /** `i_needed_modify_power_client_needed_serverquery_view_power`: The power needed to modify `i_client_needed_serverquery_view_power`. */
    readonly NeededModifyPowerClientNeededServerQueryViewPower: "i_needed_modify_power_client_needed_serverquery_view_power";
    /** `i_needed_modify_power_client_custom_info_view`: The power needed to modify `b_client_custom_info_view`. */
    readonly NeededModifyPowerClientCustomInfoView: "i_needed_modify_power_client_custom_info_view";
    /** `i_needed_modify_power_client_kick_from_server_power`: The power needed to modify `i_client_kick_from_server_power`. */
    readonly NeededModifyPowerClientKickFromServerPower: "i_needed_modify_power_client_kick_from_server_power";
    /** `i_needed_modify_power_client_needed_kick_from_server_power`: The power needed to modify `i_client_needed_kick_from_server_power`. */
    readonly NeededModifyPowerClientNeededKickFromServerPower: "i_needed_modify_power_client_needed_kick_from_server_power";
    /** `i_needed_modify_power_client_kick_from_channel_power`: The power needed to modify `i_client_kick_from_channel_power`. */
    readonly NeededModifyPowerClientKickFromChannelPower: "i_needed_modify_power_client_kick_from_channel_power";
    /** `i_needed_modify_power_client_needed_kick_from_channel_power`: The power needed to modify `i_client_needed_kick_from_channel_power`. */
    readonly NeededModifyPowerClientNeededKickFromChannelPower: "i_needed_modify_power_client_needed_kick_from_channel_power";
    /** `i_needed_modify_power_client_ban_power`: The power needed to modify `i_client_ban_power`. */
    readonly NeededModifyPowerClientBanPower: "i_needed_modify_power_client_ban_power";
    /** `i_needed_modify_power_client_needed_ban_power`: The power needed to modify `i_client_needed_ban_power`. */
    readonly NeededModifyPowerClientNeededBanPower: "i_needed_modify_power_client_needed_ban_power";
    /** `i_needed_modify_power_client_move_power`: The power needed to modify `i_client_move_power`. */
    readonly NeededModifyPowerClientMovePower: "i_needed_modify_power_client_move_power";
    /** `i_needed_modify_power_client_needed_move_power`: The power needed to modify `i_client_needed_move_power`. */
    readonly NeededModifyPowerClientNeededMovePower: "i_needed_modify_power_client_needed_move_power";
    /** `i_needed_modify_power_client_complain_power`: The power needed to modify `i_client_complain_power`. */
    readonly NeededModifyPowerClientComplainPower: "i_needed_modify_power_client_complain_power";
    /** `i_needed_modify_power_client_needed_complain_power`: The power needed to modify `i_client_needed_complain_power`. */
    readonly NeededModifyPowerClientNeededComplainPower: "i_needed_modify_power_client_needed_complain_power";
    /** `i_needed_modify_power_client_complain_list`: The power needed to modify `b_client_complain_list`. */
    readonly NeededModifyPowerClientComplainList: "i_needed_modify_power_client_complain_list";
    /** `i_needed_modify_power_client_complain_delete_own`: The power needed to modify `b_client_complain_delete_own`. */
    readonly NeededModifyPowerClientComplainDeleteOwn: "i_needed_modify_power_client_complain_delete_own";
    /** `i_needed_modify_power_client_complain_delete`: The power needed to modify `b_client_complain_delete`. */
    readonly NeededModifyPowerClientComplainDelete: "i_needed_modify_power_client_complain_delete";
    /** `i_needed_modify_power_client_ban_list`: The power needed to modify `b_client_ban_list`. */
    readonly NeededModifyPowerClientBanList: "i_needed_modify_power_client_ban_list";
    /** `i_needed_modify_power_client_ban_create`: The power needed to modify `b_client_ban_create`. */
    readonly NeededModifyPowerClientBanCreate: "i_needed_modify_power_client_ban_create";
    /** `i_needed_modify_power_client_ban_delete_own`: The power needed to modify `b_client_ban_delete_own`. */
    readonly NeededModifyPowerClientBanDeleteOwn: "i_needed_modify_power_client_ban_delete_own";
    /** `i_needed_modify_power_client_ban_delete`: The power needed to modify `b_client_ban_delete`. */
    readonly NeededModifyPowerClientBanDelete: "i_needed_modify_power_client_ban_delete";
    /** `i_needed_modify_power_client_ban_max_bantime`: The power needed to modify `i_client_ban_max_bantime`. */
    readonly NeededModifyPowerClientBanMaxBanTime: "i_needed_modify_power_client_ban_max_bantime";
    /** `i_needed_modify_power_channel_textmessage_delete`: The power needed to modify `b_channel_textmessage_delete`. TeamSpeak 6 only. */
    readonly NeededModifyPowerChannelTextMessageDelete: "i_needed_modify_power_channel_textmessage_delete";
    /** `i_needed_modify_power_client_private_textmessage_power`: The power needed to modify `i_client_private_textmessage_power`. */
    readonly NeededModifyPowerClientPrivateTextMessagePower: "i_needed_modify_power_client_private_textmessage_power";
    /** `i_needed_modify_power_client_needed_private_textmessage_power`: The power needed to modify `i_client_needed_private_textmessage_power`. */
    readonly NeededModifyPowerClientNeededPrivateTextMessagePower: "i_needed_modify_power_client_needed_private_textmessage_power";
    /** `i_needed_modify_power_client_server_textmessage_send`: The power needed to modify `b_client_server_textmessage_send`. */
    readonly NeededModifyPowerClientServerTextMessageSend: "i_needed_modify_power_client_server_textmessage_send";
    /** `i_needed_modify_power_client_channel_textmessage_send`: The power needed to modify `b_client_channel_textmessage_send`. */
    readonly NeededModifyPowerClientChannelTextMessageSend: "i_needed_modify_power_client_channel_textmessage_send";
    /** `i_needed_modify_power_client_offline_textmessage_send`: The power needed to modify `b_client_offline_textmessage_send`. */
    readonly NeededModifyPowerClientOfflineTextMessageSend: "i_needed_modify_power_client_offline_textmessage_send";
    /** `i_needed_modify_power_client_talk_power`: The power needed to modify `i_client_talk_power`. */
    readonly NeededModifyPowerClientTalkPower: "i_needed_modify_power_client_talk_power";
    /** `i_needed_modify_power_client_needed_talk_power`: The power needed to modify `i_client_needed_talk_power`. */
    readonly NeededModifyPowerClientNeededTalkPower: "i_needed_modify_power_client_needed_talk_power";
    /** `i_needed_modify_power_client_poke_power`: The power needed to modify `i_client_poke_power`. */
    readonly NeededModifyPowerClientPokePower: "i_needed_modify_power_client_poke_power";
    /** `i_needed_modify_power_client_needed_poke_power`: The power needed to modify `i_client_needed_poke_power`. */
    readonly NeededModifyPowerClientNeededPokePower: "i_needed_modify_power_client_needed_poke_power";
    /** `i_needed_modify_power_client_set_flag_talker`: The power needed to modify `b_client_set_flag_talker`. */
    readonly NeededModifyPowerClientSetFlagTalker: "i_needed_modify_power_client_set_flag_talker";
    /** `i_needed_modify_power_client_whisper_power`: The power needed to modify `i_client_whisper_power`. */
    readonly NeededModifyPowerClientWhisperPower: "i_needed_modify_power_client_whisper_power";
    /** `i_needed_modify_power_client_needed_whisper_power`: The power needed to modify `i_client_needed_whisper_power`. */
    readonly NeededModifyPowerClientNeededWhisperPower: "i_needed_modify_power_client_needed_whisper_power";
    /** `i_needed_modify_power_client_modify_description`: The power needed to modify `b_client_modify_description`. */
    readonly NeededModifyPowerClientModifyDescription: "i_needed_modify_power_client_modify_description";
    /** `i_needed_modify_power_client_modify_own_description`: The power needed to modify `b_client_modify_own_description`. */
    readonly NeededModifyPowerClientModifyOwnDescription: "i_needed_modify_power_client_modify_own_description";
    /** `i_needed_modify_power_client_modify_dbproperties`: The power needed to modify `b_client_modify_dbproperties`. */
    readonly NeededModifyPowerClientModifyDBProperties: "i_needed_modify_power_client_modify_dbproperties";
    /** `i_needed_modify_power_client_delete_dbproperties`: The power needed to modify `b_client_delete_dbproperties`. */
    readonly NeededModifyPowerClientDeleteDBProperties: "i_needed_modify_power_client_delete_dbproperties";
    /** `i_needed_modify_power_client_create_modify_serverquery_login`: The power needed to modify `b_client_create_modify_serverquery_login`. */
    readonly NeededModifyPowerClientCreateModifyServerQueryLogin: "i_needed_modify_power_client_create_modify_serverquery_login";
    /** `i_needed_modify_power_ft_ignore_password`: The power needed to modify `b_ft_ignore_password`. */
    readonly NeededModifyPowerFTIgnorePassword: "i_needed_modify_power_ft_ignore_password";
    /** `i_needed_modify_power_ft_transfer_list`: The power needed to modify `b_ft_transfer_list`. */
    readonly NeededModifyPowerFTTransferList: "i_needed_modify_power_ft_transfer_list";
    /** `i_needed_modify_power_ft_file_upload_power`: The power needed to modify `i_ft_file_upload_power`. */
    readonly NeededModifyPowerFTFileUploadPower: "i_needed_modify_power_ft_file_upload_power";
    /** `i_needed_modify_power_ft_needed_file_upload_power`: The power needed to modify `i_ft_needed_file_upload_power`. */
    readonly NeededModifyPowerFTNeededFileUploadPower: "i_needed_modify_power_ft_needed_file_upload_power";
    /** `i_needed_modify_power_ft_file_download_power`: The power needed to modify `i_ft_file_download_power`. */
    readonly NeededModifyPowerFTFileDownloadPower: "i_needed_modify_power_ft_file_download_power";
    /** `i_needed_modify_power_ft_needed_file_download_power`: The power needed to modify `i_ft_needed_file_download_power`. */
    readonly NeededModifyPowerFTNeededFileDownloadPower: "i_needed_modify_power_ft_needed_file_download_power";
    /** `i_needed_modify_power_ft_file_delete_power`: The power needed to modify `i_ft_file_delete_power`. */
    readonly NeededModifyPowerFTFileDeletePower: "i_needed_modify_power_ft_file_delete_power";
    /** `i_needed_modify_power_ft_needed_file_delete_power`: The power needed to modify `i_ft_needed_file_delete_power`. */
    readonly NeededModifyPowerFTNeededFileDeletePower: "i_needed_modify_power_ft_needed_file_delete_power";
    /** `i_needed_modify_power_ft_file_rename_power`: The power needed to modify `i_ft_file_rename_power`. */
    readonly NeededModifyPowerFTFileRenamePower: "i_needed_modify_power_ft_file_rename_power";
    /** `i_needed_modify_power_ft_needed_file_rename_power`: The power needed to modify `i_ft_needed_file_rename_power`. */
    readonly NeededModifyPowerFTNeededFileRenamePower: "i_needed_modify_power_ft_needed_file_rename_power";
    /** `i_needed_modify_power_ft_file_browse_power`: The power needed to modify `i_ft_file_browse_power`. */
    readonly NeededModifyPowerFTFileBrowsePower: "i_needed_modify_power_ft_file_browse_power";
    /** `i_needed_modify_power_ft_needed_file_browse_power`: The power needed to modify `i_ft_needed_file_browse_power`. */
    readonly NeededModifyPowerFTNeededFileBrowsePower: "i_needed_modify_power_ft_needed_file_browse_power";
    /** `i_needed_modify_power_ft_directory_create_power`: The power needed to modify `i_ft_directory_create_power`. */
    readonly NeededModifyPowerFTDirectoryCreatePower: "i_needed_modify_power_ft_directory_create_power";
    /** `i_needed_modify_power_ft_needed_directory_create_power`: The power needed to modify `i_ft_needed_directory_create_power`. */
    readonly NeededModifyPowerFTNeededDirectoryCreatePower: "i_needed_modify_power_ft_needed_directory_create_power";
    /** `i_needed_modify_power_ft_quota_mb_download_per_client`: The power needed to modify `i_ft_quota_mb_download_per_client`. */
    readonly NeededModifyPowerFTQuotaMBDownloadPerClient: "i_needed_modify_power_ft_quota_mb_download_per_client";
    /** `i_needed_modify_power_ft_quota_mb_upload_per_client`: The power needed to modify `i_ft_quota_mb_upload_per_client`. */
    readonly NeededModifyPowerFTQuotaMBUploadPerClient: "i_needed_modify_power_ft_quota_mb_upload_per_client";
    /** `i_needed_modify_power_ft_storage_mb_per_client`: The power needed to modify `i_ft_storage_mb_per_client`. TeamSpeak 6 only. */
    readonly NeededModifyPowerFTStorageMBPerClient: "i_needed_modify_power_ft_storage_mb_per_client";
    /** `i_needed_modify_power_ft_max_file_size_mb`: The power needed to modify `i_ft_max_file_size_mb`. TeamSpeak 6 only. */
    readonly NeededModifyPowerFTMaxFileSizeMB: "i_needed_modify_power_ft_max_file_size_mb";
};
/** The permission names; see {@link PermissionName}'s entries for what each allows. */
export declare const PermissionName: typeof permissionNameValues;
/** A permission name a TeamSpeak 3.13 or 6 server knows. */
export type PermissionName = (typeof PermissionName)[keyof typeof PermissionName];
export {};
//# sourceMappingURL=permission-name.d.ts.map