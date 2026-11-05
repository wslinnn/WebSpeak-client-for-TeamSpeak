/**
 * The names of the commands a TeamSpeak server takes, for a raw line sent with
 * `client.exec` (built with `escape`) and for reading `CommandRequest.command`
 * in command middleware:
 *
 * ```ts
 * await client.exec(`${CommandName.ServerGroupList}`);
 * // or, in command middleware:
 * if (request.command === CommandName.ClientMove) { ... }
 * ```
 *
 * A name marked TeamSpeak 6 only is missing on TeamSpeak 3, and one marked
 * voice protocol only is not a ServerQuery command. A server may know commands
 * this table does not.
 */
declare const commandNameValues: {
    /** `apikeyadd`: Creates a new api key with the given scope for the invoking user. */
    readonly APIKeyAdd: "apikeyadd";
    /** `apikeydel`: Deletes an apikey. */
    readonly APIKeyDel: "apikeydel";
    /** `apikeylist`: Lists the api keys of the invoking user, or of all users. */
    readonly APIKeyList: "apikeylist";
    /** `authenticationtoken`: Returns a token other services can use as proof that this server identifies you as a user. TeamSpeak 6 only. */
    readonly AuthenticationToken: "authenticationtoken";
    /** `banadd`: Adds a new ban rule on the selected virtual server. */
    readonly BanAdd: "banadd";
    /** `banclient`: Bans one or more clients specified with the given client ids from the server. */
    readonly BanClient: "banclient";
    /** `bandel`: Deletes the ban rule with ID banid from the server. */
    readonly BanDel: "bandel";
    /** `bandelall`: Deletes all active ban rules from the server. */
    readonly BanDelAll: "bandelall";
    /** `banfind`: Displays a list of matching bans on the selected virtual server. TeamSpeak 6 only. */
    readonly BanFind: "banfind";
    /** `banlist`: Displays a list of active bans on the selected virtual server. */
    readonly BanList: "banlist";
    /** `bindinglist`: Displays a list of IP addresses used by the server instance on multi-homed machines. */
    readonly BindingList: "bindinglist";
    /** `channeladdperm`: Adds a set of specified permissions to a channel. */
    readonly ChannelAddPerm: "channeladdperm";
    /** `channelclientaddperm`: Adds a set of specified permissions to a client in a specific channel. */
    readonly ChannelClientAddPerm: "channelclientaddperm";
    /** `channelclientdelperm`: Removes a set of specified permissions from a client in a specific channel. */
    readonly ChannelClientDelPerm: "channelclientdelperm";
    /** `channelclientpermlist`: Displays a list of permissions defined for a client in a specific channel. */
    readonly ChannelClientPermList: "channelclientpermlist";
    /** `channelcreate`: Creates a new channel using the given properties and displays its ID. */
    readonly ChannelCreate: "channelcreate";
    /** `channeldelete`: Deletes an existing channel by ID. */
    readonly ChannelDelete: "channeldelete";
    /** `channeldelperm`: Removes a set of specified permissions from a channel. */
    readonly ChannelDelPerm: "channeldelperm";
    /** `channeledit`: Changes a channel's configuration using given properties. */
    readonly ChannelEdit: "channeledit";
    /** `channelfind`: Displays a list of channels matching a given name pattern. */
    readonly ChannelFind: "channelfind";
    /** `channelgetdescription`: Asks the server for a channel's description, which it is not sent with the channel list. Voice protocol only. */
    readonly ChannelGetDescription: "channelgetdescription";
    /** `channelgroupadd`: Creates a new channel group using a given name and displays its ID. */
    readonly ChannelGroupAdd: "channelgroupadd";
    /** `channelgroupaddperm`: Adds a set of specified permissions to a channel group. */
    readonly ChannelGroupAddPerm: "channelgroupaddperm";
    /** `channelgroupclientlist`: Displays all the client and/or channel IDs currently assigned to channel groups. */
    readonly ChannelGroupClientList: "channelgroupclientlist";
    /** `channelgroupcopy`: Creates a copy of a channel group, or overwrites an existing group with it. */
    readonly ChannelGroupCopy: "channelgroupcopy";
    /** `channelgroupdel`: Deletes a channel group by ID. */
    readonly ChannelGroupDel: "channelgroupdel";
    /** `channelgroupdelperm`: Removes a set of specified permissions from the channel group. */
    readonly ChannelGroupDelPerm: "channelgroupdelperm";
    /** `channelgrouplist`: Displays a list of channel groups available on the selected virtual server. */
    readonly ChannelGroupList: "channelgrouplist";
    /** `channelgrouppermlist`: Displays a list of permissions assigned to the channel group specified with cgid. */
    readonly ChannelGroupPermList: "channelgrouppermlist";
    /** `channelgrouprename`: Changes the name of a specified channel group. */
    readonly ChannelGroupRename: "channelgrouprename";
    /** `channelinfo`: Displays detailed configuration information about a channel including ID, topic, description, etc. */
    readonly ChannelInfo: "channelinfo";
    /** `channellist`: Displays a list of channels created on a virtual server including their ID, order, name, etc. */
    readonly ChannelList: "channellist";
    /** `channelmove`: Moves a channel to a new parent channel with the ID cpid. */
    readonly ChannelMove: "channelmove";
    /** `channelpermlist`: Displays a list of permissions defined for a channel. */
    readonly ChannelPermList: "channelpermlist";
    /** `channelsubscribe`: Subscribes this client to a channel so it sees the clients in it; their voice reaches only the clients in the channel. Voice protocol only. */
    readonly ChannelSubscribe: "channelsubscribe";
    /** `channelsubscribeall`: Subscribes this client to every channel on the server. Voice protocol only. */
    readonly ChannelSubscribeAll: "channelsubscribeall";
    /** `channelunsubscribe`: Unsubscribes this client from a channel, so the clients in it go out of view. Voice protocol only. */
    readonly ChannelUnsubscribe: "channelunsubscribe";
    /** `channelunsubscribeall`: Unsubscribes this client from every channel but the one it is in. Voice protocol only. */
    readonly ChannelUnsubscribeAll: "channelunsubscribeall";
    /** `chatlogintoken`: Returns a JSON Web Token for logging in to the Matrix server the server uses for chat. TeamSpeak 6 only. */
    readonly ChatLoginToken: "chatlogintoken";
    /** `clientaddperm`: Adds a set of specified permissions to a client. */
    readonly ClientAddPerm: "clientaddperm";
    /** `clientaddservergroup`: Adds a client to one or more server groups specified with sgid. */
    readonly ClientAddServerGroup: "clientaddservergroup";
    /** `clientchatclosed`: Tells a client this client has closed its private chat window with it. Voice protocol only. */
    readonly ClientChatClosed: "clientchatclosed";
    /** `clientchatcomposing`: Tells a client this client is typing a private message to it. Voice protocol only. */
    readonly ClientChatComposing: "clientchatcomposing";
    /** `clientdbdelete`: Deletes a client's properties from the database. */
    readonly ClientDBDelete: "clientdbdelete";
    /** `clientdbedit`: Changes a client's settings using given properties. */
    readonly ClientDBEdit: "clientdbedit";
    /** `clientdbfind`: Displays a list of client database IDs matching a given pattern. */
    readonly ClientDBFind: "clientdbfind";
    /** `clientdbinfo`: Displays detailed database information about a client including unique ID, creation date, etc. */
    readonly ClientDBInfo: "clientdbinfo";
    /** `clientdblist`: Displays a list of client identities known by the server including their database ID, last nickname, etc. */
    readonly ClientDBList: "clientdblist";
    /** `clientdelperm`: Removes a set of specified permissions from a client. */
    readonly ClientDelPerm: "clientdelperm";
    /** `clientdelservergroup`: Removes a client from one or more server groups. */
    readonly ClientDelServerGroup: "clientdelservergroup";
    /** `clientdisconnect`: Tells the server this client is leaving, with an optional reason message. Voice protocol only. */
    readonly ClientDisconnect: "clientdisconnect";
    /** `clientedit`: Changes a client's settings using given properties. */
    readonly ClientEdit: "clientedit";
    /** `clientfind`: Displays a list of clients matching a given name pattern. */
    readonly ClientFind: "clientfind";
    /** `clientgetdbidfromuid`: Displays the database ID matching the unique identifier specified by cluid. */
    readonly ClientGetDBIDFromUID: "clientgetdbidfromuid";
    /** `clientgetids`: Displays all client IDs matching the unique identifier specified by cluid. */
    readonly ClientGetIDs: "clientgetids";
    /** `clientgetnamefromdbid`: Displays the unique identifier and nickname matching the database ID specified by cldbid. */
    readonly ClientGetNameFromDBID: "clientgetnamefromdbid";
    /** `clientgetnamefromuid`: Displays the database ID and nickname matching the unique identifier specified by cluid. */
    readonly ClientGetNameFromUID: "clientgetnamefromuid";
    /** `clientgetuidfromclid`: Displays the unique identifier matching the clientID specified by clid. */
    readonly ClientGetUIDFromCLID: "clientgetuidfromclid";
    /** `clientgetvariables`: Asks the server to send a client's properties again, as a `notifyclientupdated`. Voice protocol only. */
    readonly ClientGetVariables: "clientgetvariables";
    /** `clientinfo`: Displays detailed configuration information about a client including unique ID, nickname, client version, etc. */
    readonly ClientInfo: "clientinfo";
    /** `clientkick`: Kicks one or more clients from their channel (reasonid 4) or from the server (reasonid 5). */
    readonly ClientKick: "clientkick";
    /** `clientlist`: Displays a list of clients online on a virtual server including their ID, nickname, status flags, etc. */
    readonly ClientList: "clientlist";
    /** `clientmove`: Moves one or more clients to another channel. */
    readonly ClientMove: "clientmove";
    /** `clientmute`: Stops the server forwarding the given clients' voice to this client. Voice protocol only. */
    readonly ClientMute: "clientmute";
    /** `clientpermlist`: Displays a list of permissions defined for a client. */
    readonly ClientPermList: "clientpermlist";
    /** `clientpoke`: Sends a poke message to the client specified with clid. */
    readonly ClientPoke: "clientpoke";
    /** `clientsetserverquerylogin`: Updates your own ServerQuery login credentials using a specified username. */
    readonly ClientSetServerQueryLogin: "clientsetserverquerylogin";
    /** `clientunmute`: Resumes forwarding the given clients' voice to this client. Voice protocol only. */
    readonly ClientUnmute: "clientunmute";
    /** `clientupdate`: Changes your ServerQuery clients settings using given properties. */
    readonly ClientUpdate: "clientupdate";
    /** `complainadd`: Submits a complaint about a connected client with database ID tcldbid to the server. */
    readonly ComplainAdd: "complainadd";
    /** `complaindel`: Deletes the complaint about the client with ID tcldbid submitted by the client with ID fcldbid from the server. */
    readonly ComplainDel: "complaindel";
    /** `complaindelall`: Deletes all complaints about the client with database ID tcldbid from the server. */
    readonly ComplainDelAll: "complaindelall";
    /** `complainlist`: Displays a list of complaints on the selected virtual server. */
    readonly ComplainList: "complainlist";
    /** `customdelete`: Removes a custom property from a client specified by the cldbid. */
    readonly CustomDelete: "customdelete";
    /** `custominfo`: Displays a list of custom properties for the client specified with cldbid. */
    readonly CustomInfo: "custominfo";
    /** `customsearch`: Searches for custom client properties specified by ident and value. */
    readonly CustomSearch: "customsearch";
    /** `customset`: Creates or updates a custom property for client specified by the cldbid. */
    readonly CustomSet: "customset";
    /** `getconnectioninfo`: Asks the server for a client's connection statistics, answered by `notifyconnectioninfo`. Voice protocol only. */
    readonly GetConnectionInfo: "getconnectioninfo";
    /** `ftcreatedir`: Creates new directory in a channel's file repository. */
    readonly FTCreateDir: "ftcreatedir";
    /** `ftdeletefile`: Deletes one or more files stored in a channel's file repository. */
    readonly FTDeleteFile: "ftdeletefile";
    /** `ftgetchannelfilehttptoken`: Returns a JSON Web Token for authenticating to a HTTP file transfer server. TeamSpeak 6 only. */
    readonly FTGetChannelFileHTTPToken: "ftgetchannelfilehttptoken";
    /** `ftgetfileinfo`: Displays detailed information about one or more specified files stored in a channel's file repository. */
    readonly FTGetFileInfo: "ftgetfileinfo";
    /** `ftgetfilelist`: Displays a list of files and directories stored in the specified channels file repository. */
    readonly FTGetFileList: "ftgetfilelist";
    /** `ftinitdownload`: Initializes a file transfer download. */
    readonly FTInitDownload: "ftinitdownload";
    /** `ftinitupload`: Initializes a file transfer upload. */
    readonly FTInitUpload: "ftinitupload";
    /** `ftlist`: Displays a list of running file transfers on the selected virtual server. */
    readonly FTList: "ftlist";
    /** `ftrenamefile`: Renames a file in a channel's file repository. */
    readonly FTRenameFile: "ftrenamefile";
    /** `ftstop`: Stops the running file transfer with server-side ID serverftfid. */
    readonly FTStop: "ftstop";
    /** `gm`: Sends a text message to all clients on all virtual servers in the server instance. */
    readonly GM: "gm";
    /** `help`: Lists all commands, or shows the usage, permissions and parameters of one command. */
    readonly Help: "help";
    /** `homebasedel`: Unsets this server as the matrix homebase server for the calling client, or the client specified with cldbid if given. TeamSpeak 6 only. */
    readonly HomeBaseDel: "homebasedel";
    /** `homebaseisset`: Checks if this server is set as the matrix homebase server for the calling client, or the client specified with cldbid if given. TeamSpeak 6 only. */
    readonly HomeBaseIsSet: "homebaseisset";
    /** `homebaselist`: Lists all users that have set this server as their matrix homebase. TeamSpeak 6 only. */
    readonly HomeBaseList: "homebaselist";
    /** `homebaseset`: Sets this server as the matrix homebase server for the calling client, or the client specified with cldbid if given. TeamSpeak 6 only. */
    readonly HomeBaseSet: "homebaseset";
    /** `hostinfo`: Displays detailed connection information about the server instance including uptime, number of virtual servers online, traffic information, etc. */
    readonly HostInfo: "hostinfo";
    /** `instanceedit`: Changes the server instance configuration using given properties. */
    readonly InstanceEdit: "instanceedit";
    /** `instanceinfo`: Displays the server instance configuration including database revision number, the file transfer port, default group IDs, etc. */
    readonly InstanceInfo: "instanceinfo";
    /** `joinstreamrequest`: Asks the owner of a stream to let this client watch it, or, with `is_remove=1`, says it stops watching. Voice protocol only, TeamSpeak 6 only; undocumented by TeamSpeak. */
    readonly JoinStreamRequest: "joinstreamrequest";
    /** `licensesignmessage`: Signs the message with the private key of your license. TeamSpeak 6 only. */
    readonly LicenseSignMessage: "licensesignmessage";
    /** `logadd`: Writes a custom entry into the server's log. */
    readonly LogAdd: "logadd";
    /** `login`: Authenticates with the server instance using given ServerQuery login credentials. */
    readonly Login: "login";
    /** `logout`: Deselects the active virtual server and logs out from the server instance. */
    readonly Logout: "logout";
    /** `logview`: Displays a specified number of entries from the server's log. */
    readonly LogView: "logview";
    /** `messageadd`: Sends an offline message to the client specified by cluid. */
    readonly MessageAdd: "messageadd";
    /** `messagedel`: Deletes an existing offline message with ID msgid from your inbox. */
    readonly MessageDel: "messagedel";
    /** `messageget`: Displays an existing offline message with ID msgid from your inbox. */
    readonly MessageGet: "messageget";
    /** `messagelist`: Displays a list of offline messages you've received. */
    readonly MessageList: "messagelist";
    /** `messageupdateflag`: Updates the flag_read property of the offline message specified with msgid. */
    readonly MessageUpdateFlag: "messageupdateflag";
    /** `permfind`: Displays detailed information about all assignments of the permission specified with permid. */
    readonly PermFind: "permfind";
    /** `permget`: Displays the current value of the permission specified with permid or permsid for your own connection. */
    readonly PermGet: "permget";
    /** `permidgetbyname`: Displays the database ID of one or more permissions specified by permsid. */
    readonly PermIDGetByName: "permidgetbyname";
    /** `permissionlist`: Displays a list of permissions available on the server instance including ID, name and description. */
    readonly PermissionList: "permissionlist";
    /** `permoverview`: Displays all permissions assigned to a client for the channel specified with cid. */
    readonly PermOverview: "permoverview";
    /** `permreset`: Restores the default permission settings on the selected virtual server and creates a new initial administrator token. */
    readonly PermReset: "permreset";
    /** `plugincmd`: Sends a plugin-defined message to the clients of a channel, the server or chosen clients, for plugins to read. Voice protocol only. */
    readonly PluginCmd: "plugincmd";
    /** `privilegekeyadd`: Creates a new privilege key, a token that grants a server or channel group. */
    readonly PrivilegeKeyAdd: "privilegekeyadd";
    /** `privilegekeydelete`: Deletes an existing token matching the token key specified with token. */
    readonly PrivilegeKeyDelete: "privilegekeydelete";
    /** `privilegekeylist`: Displays a list of privilege keys available including their type and group IDs. */
    readonly PrivilegeKeyList: "privilegekeylist";
    /** `privilegekeyuse`: Uses a privilege key to gain access to a server or channel group. */
    readonly PrivilegeKeyUse: "privilegekeyuse";
    /** `queryloginadd`: Adds a new query client login, or enables query login for existing clients. */
    readonly QueryLoginAdd: "queryloginadd";
    /** `querylogindel`: Deletes an existing server query login on selected server. */
    readonly QueryLoginDel: "querylogindel";
    /** `queryloginlist`: Lists existing query client logins. */
    readonly QueryLoginList: "queryloginlist";
    /** `quit`: Closes the ServerQuery connection to the server instance. */
    readonly Quit: "quit";
    /** `requeststreaminfo`: Asks for the streams a client has running, each answered with a `notifystreaminfo`. Voice protocol only, TeamSpeak 6 only; undocumented by TeamSpeak. */
    readonly RequestStreamInfo: "requeststreaminfo";
    /** `respondjoinstreamrequest`: The stream owner's answer to a join request: accepts with the SDP offer, or denies. Voice protocol only, TeamSpeak 6 only; undocumented by TeamSpeak. */
    readonly RespondJoinStreamRequest: "respondjoinstreamrequest";
    /** `sendtextmessage`: Sends a text message to a specified target. */
    readonly SendTextMessage: "sendtextmessage";
    /** `servercreate`: Creates a new virtual server using the given properties and displays its ID, port and initial administrator privilege key. */
    readonly ServerCreate: "servercreate";
    /** `serverdelete`: Deletes the virtual server specified with sid. */
    readonly ServerDelete: "serverdelete";
    /** `serveredit`: Changes the selected virtual server's configuration using given properties. */
    readonly ServerEdit: "serveredit";
    /** `servergroupadd`: Creates a new server group using the name specified with name and displays its ID. */
    readonly ServerGroupAdd: "servergroupadd";
    /** `servergroupaddclient`: Adds one or more clients to the server group specified with sgid. */
    readonly ServerGroupAddClient: "servergroupaddclient";
    /** `servergroupaddperm`: Adds a set of specified permissions to the server group specified with sgid. */
    readonly ServerGroupAddPerm: "servergroupaddperm";
    /** `servergroupautoaddperm`: Adds a set of specified permissions to all regular server groups on all virtual servers. */
    readonly ServerGroupAutoAddPerm: "servergroupautoaddperm";
    /** `servergroupautodelperm`: Removes a set of specified permissions from all regular server groups on all virtual servers. */
    readonly ServerGroupAutoDelPerm: "servergroupautodelperm";
    /** `servergroupclientlist`: Displays the IDs of all clients currently residing in the server group specified with sgid. */
    readonly ServerGroupClientList: "servergroupclientlist";
    /** `servergroupcopy`: Creates a copy of a server group, or overwrites an existing group with it. */
    readonly ServerGroupCopy: "servergroupcopy";
    /** `servergroupdel`: Deletes the server group specified with sgid. */
    readonly ServerGroupDel: "servergroupdel";
    /** `servergroupdelclient`: Removes one or more clients specified with cldbid from the server group specified with sgid. */
    readonly ServerGroupDelClient: "servergroupdelclient";
    /** `servergroupdelperm`: Removes a set of specified permissions from the server group specified with sgid. */
    readonly ServerGroupDelPerm: "servergroupdelperm";
    /** `servergrouplist`: Displays a list of server groups available. */
    readonly ServerGroupList: "servergrouplist";
    /** `servergrouppermlist`: Displays a list of permissions assigned to the server group specified with sgid. */
    readonly ServerGroupPermList: "servergrouppermlist";
    /** `servergrouprename`: Changes the name of the server group specified with sgid. */
    readonly ServerGroupRename: "servergrouprename";
    /** `servergroupsbyclientid`: Displays all server groups the client specified with cldbid is currently residing in. */
    readonly ServerGroupsByClientID: "servergroupsbyclientid";
    /** `serveridgetbyport`: Displays the database ID of the virtual server running on the UDP port specified by virtualserver_port. */
    readonly ServerIDGetByPort: "serveridgetbyport";
    /** `servergetvariables`: Asks the server to send the virtual server's properties again, as a `notifyserverupdated`. Voice protocol only. */
    readonly ServerGetVariables: "servergetvariables";
    /** `serverinfo`: Displays detailed configuration information about the selected virtual server including unique ID, number of clients online, configuration, etc. */
    readonly ServerInfo: "serverinfo";
    /** `serverlist`: Displays a list of virtual servers including their ID, status, number of clients online, etc. */
    readonly ServerList: "serverlist";
    /** `servernotifyregister`: Registers for a specified category of events on a virtual server to receive notification messages. */
    readonly ServerNotifyRegister: "servernotifyregister";
    /** `servernotifyunregister`: Unregisters from one category of events, or from all of them when no event is given. */
    readonly ServerNotifyUnregister: "servernotifyunregister";
    /** `serverprocessstop`: Stops the entire server instance by shutting down the process. */
    readonly ServerProcessStop: "serverprocessstop";
    /** `serverrequestconnectioninfo`: Displays detailed connection information about the selected virtual server including uptime, traffic information, etc. */
    readonly ServerRequestConnectionInfo: "serverrequestconnectioninfo";
    /** `serversnapshotcreate`: Displays a snapshot of the selected virtual server containing all settings, groups and known client identities. */
    readonly ServerSnapshotCreate: "serversnapshotcreate";
    /** `serversnapshotdeploy`: Restores the selected virtual server's configuration using the data from a previously created server snapshot. */
    readonly ServerSnapshotDeploy: "serversnapshotdeploy";
    /** `serverstart`: Starts the virtual server specified with sid. */
    readonly ServerStart: "serverstart";
    /** `serverstop`: Stops the virtual server specified with sid. */
    readonly ServerStop: "serverstop";
    /** `servertemppasswordadd`: Sets a new temporary server password specified with pw. */
    readonly ServerTempPasswordAdd: "servertemppasswordadd";
    /** `servertemppassworddel`: Deletes the temporary server password specified with pw. */
    readonly ServerTempPasswordDel: "servertemppassworddel";
    /** `servertemppasswordlist`: Returns a list of active temporary server passwords. */
    readonly ServerTempPasswordList: "servertemppasswordlist";
    /** `setclientchannelgroup`: Sets the channel group of a client to the ID specified with cgid. */
    readonly SetClientChannelGroup: "setclientchannelgroup";
    /** `setupstream`: Starts a stream and announces it to the channel with a `notifystreamstarted`. Voice protocol only, TeamSpeak 6 only; undocumented by TeamSpeak. */
    readonly SetupStream: "setupstream";
    /** `setconnectioninfo`: A client reporting its own connection statistics, in answer to notifyconnectioninforequest. Voice protocol only. */
    readonly SetConnectionInfo: "setconnectioninfo";
    /** `stopstream`: Stops a stream. The server does not check who asks. Voice protocol only, TeamSpeak 6 only; undocumented by TeamSpeak. */
    readonly StopStream: "stopstream";
    /** `streamsignaling`: Relays a signalling message, a JSON string, between the owner of a stream and a viewer it accepted. Voice protocol only, TeamSpeak 6 only; undocumented by TeamSpeak. */
    readonly StreamSignaling: "streamsignaling";
    /** `tokenadd`: Alias for privilegekeyadd. */
    readonly TokenAdd: "tokenadd";
    /** `tokendelete`: Alias for privilegekeydelete. */
    readonly TokenDelete: "tokendelete";
    /** `tokenlist`: Alias for privilegekeylist. */
    readonly TokenList: "tokenlist";
    /** `tokenuse`: Alias for privilegekeyuse. */
    readonly TokenUse: "tokenuse";
    /** `use`: Selects the virtual server specified with sid or port to allow further interaction. */
    readonly Use: "use";
    /** `version`: Displays the server's version information including platform and build number. */
    readonly Version: "version";
    /** `verifychannelpassword`: Checks a channel's password, given hashed as the voice protocol sends it. Voice protocol only. */
    readonly VerifyChannelPassword: "verifychannelpassword";
    /** `verifyserverpassword`: Checks the server's password, given hashed as the voice protocol sends it. Voice protocol only. */
    readonly VerifyServerPassword: "verifyserverpassword";
    /** `whoami`: Displays information about your current ServerQuery connection including your loginname, etc. */
    readonly WhoAmI: "whoami";
};
/** The command names; see {@link CommandName}'s entries for what each does. */
export declare const CommandName: typeof commandNameValues;
/** A command name a TeamSpeak 3.13 or 6 server knows. */
export type CommandName = (typeof CommandName)[keyof typeof CommandName];
export {};
//# sourceMappingURL=command-name.d.ts.map