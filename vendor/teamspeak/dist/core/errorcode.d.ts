/** The values of the table below, before freezing. */
declare const errorCodeValues: {
    /** Success: the server answers `error id=0 msg=ok`. */
    readonly OK: 0;
    /** Undefined error. */
    readonly Undefined: 1;
    /** Not implemented. */
    readonly NotImplemented: 2;
    /** No message is known for this code. */
    readonly OKNoUpdate: 3;
    /** No message is known for this code. */
    readonly DontNotify: 4;
    /** Library time limit reached. */
    readonly LibTimeLimitReached: 5;
    /** Command not found. */
    readonly CommandNotFound: 256;
    /** Unable to bind network port. */
    readonly UnableToBindNetworkPort: 257;
    /** No network port available. */
    readonly NoNetworkPortAvailable: 258;
    /** Invalid clientID. */
    readonly ClientInvalidID: 512;
    /** Nickname is already in use. */
    readonly ClientNicknameInUse: 513;
    /** Invalid error code. */
    readonly ClientInvalidErrorCode: 514;
    /** Max clients protocol limit reached. */
    readonly ClientProtocolLimitReached: 515;
    /** Invalid client type. */
    readonly ClientInvalidType: 516;
    /** Already subscribed. */
    readonly ClientAlreadySubscribed: 517;
    /** Not logged in. */
    readonly ClientNotLoggedIn: 518;
    /** Could not validate client identity. */
    readonly ClientCouldNotValidateIdentity: 519;
    /** Invalid loginname or password. */
    readonly ClientInvalidPassword: 520;
    /** Too many clones already connected. */
    readonly ClientTooManyClonesConnected: 521;
    /** Client version outdated, please update. */
    readonly ClientVersionOutdated: 522;
    /** Client is online. */
    readonly ClientIsOnline: 523;
    /** Client is flooding. */
    readonly ClientIsFlooding: 524;
    /** Client is modified. */
    readonly ClientHacked: 525;
    /** Can not verify client at this moment. */
    readonly ClientCannotVerifyNow: 526;
    /** Client is not permitted to log in. */
    readonly ClientLoginNotPermitted: 527;
    /** Client is not subscribed to the channel. */
    readonly ClientNotSubscribed: 528;
    /** Invalid channelID. */
    readonly ChannelInvalidID: 768;
    /** Max channels protocol limit reached. */
    readonly ChannelProtocolLimitReached: 769;
    /** Already member of channel. */
    readonly ChannelAlreadyIn: 770;
    /** Channel name is already in use. */
    readonly ChannelNameInUse: 771;
    /** Channel not empty. */
    readonly ChannelNotEmpty: 772;
    /** Can not delete default channel. */
    readonly ChannelCanNotDeleteDefault: 773;
    /** Default channel requires permanent. */
    readonly ChannelDefaultRequirePermanent: 774;
    /** Invalid channel flags. */
    readonly ChannelInvalidFlags: 775;
    /** Permanent channel can not be child of non permanent channel. */
    readonly ChannelParentNotPermanent: 776;
    /** Channel maxclient reached. */
    readonly ChannelMaxClientsReached: 777;
    /** Channel maxfamily reached. */
    readonly ChannelMaxFamilyReached: 778;
    /** Invalid channel order. */
    readonly ChannelInvalidOrder: 779;
    /** Channel does not support filetransfers. */
    readonly ChannelNoFileTransferSupported: 780;
    /** Invalid channel password. */
    readonly ChannelInvalidPassword: 781;
    /** Channel is private channel. */
    readonly ChannelIsPrivateChannel: 782;
    /** Invalid security hash supplied by client. */
    readonly ChannelInvalidSecurityHash: 783;
    /** Invalid serverID. */
    readonly ServerInvalidID: 1024;
    /** Server is running. */
    readonly ServerRunning: 1025;
    /** Server is shutting down. */
    readonly ServerIsShuttingDown: 1026;
    /** Server maxclient reached. */
    readonly ServerMaxClientsReached: 1027;
    /** Invalid server password. */
    readonly ServerInvalidPassword: 1028;
    /** Deployment active. */
    readonly ServerDeploymentActive: 1029;
    /** Unable to stop own server in your connection class. */
    readonly ServerUnableToStopOwnServer: 1030;
    /** Server is virtual. */
    readonly ServerIsVirtual: 1031;
    /** Server wrong machineID. */
    readonly ServerWrongMachineID: 1032;
    /** Server is not running. */
    readonly ServerIsNotRunning: 1033;
    /** Server is booting up. */
    readonly ServerIsBooting: 1034;
    /** Server got an invalid status for this operation. */
    readonly ServerStatusInvalid: 1035;
    /** Server modal quit. */
    readonly ServerModalQuit: 1036;
    /** Server version is too old for command. */
    readonly ServerVersionOutdated: 1037;
    /** Database error. */
    readonly Database: 1280;
    /** Database empty result set. */
    readonly DatabaseEmptyResult: 1281;
    /** Database duplicate entry. */
    readonly DatabaseDuplicateEntry: 1282;
    /** Database no modifications. */
    readonly DatabaseNoModifications: 1283;
    /** Database invalid constraint. */
    readonly DatabaseConstraint: 1284;
    /** Database reinvoke command. */
    readonly DatabaseReinvoke: 1285;
    /** Invalid quote. */
    readonly ParameterQuote: 1536;
    /** Invalid parameter count. */
    readonly ParameterInvalidCount: 1537;
    /** Invalid parameter. */
    readonly ParameterInvalid: 1538;
    /** Parameter not found. */
    readonly ParameterNotFound: 1539;
    /** Convert error. */
    readonly ParameterConvert: 1540;
    /** Invalid parameter size. */
    readonly ParameterInvalidSize: 1541;
    /** Missing required parameter. */
    readonly ParameterMissing: 1542;
    /** Invalid checksum. */
    readonly ParameterChecksum: 1543;
    /** Virtual server got a critical error. */
    readonly VsCritical: 1792;
    /** Connection lost. */
    readonly ConnectionLost: 1793;
    /** Not connected. */
    readonly NotConnected: 1794;
    /** No cached connection info. */
    readonly NoCachedConnectionInfo: 1795;
    /** Currently not possible. */
    readonly CurrentlyNotPossible: 1796;
    /** Failed connection initialization. */
    readonly FailedConnectionInitialisation: 1797;
    /** Could not resolve hostname. */
    readonly CouldNotResolveHostname: 1798;
    /** Invalid server connection handler ID. */
    readonly InvalidServerConnectionHandlerID: 1799;
    /** Could not initialize Input Manager. */
    readonly CouldNotInitialiseInputManager: 1800;
    /** Client library not initialized. */
    readonly ClientLibraryNotInitialised: 1801;
    /** Server library not initialized. */
    readonly ServerLibraryNotInitialised: 1802;
    /** Too many whisper targets. */
    readonly WhisperTooManyTargets: 1803;
    /** No whisper targets found. */
    readonly WhisperNoTargets: 1804;
    /** Invalid file name. */
    readonly FileInvalidName: 2048;
    /** Invalid file permissions. */
    readonly FileInvalidPermissions: 2049;
    /** File already exists. */
    readonly FileAlreadyExists: 2050;
    /** File not found. */
    readonly FileNotFound: 2051;
    /** File input/output error. */
    readonly FileIOError: 2052;
    /** Invalid file transfer ID. */
    readonly FileInvalidTransferID: 2053;
    /** Invalid file path. */
    readonly FileInvalidPath: 2054;
    /** No files available. */
    readonly FileNoFilesAvailable: 2055;
    /** Overwrite excludes resume. */
    readonly FileOverwriteExcludesResume: 2056;
    /** Invalid file size. */
    readonly FileInvalidSize: 2057;
    /** File already in use. */
    readonly FileAlreadyInUse: 2058;
    /** Could not open file transfer connection. */
    readonly FileCouldNotOpenConnection: 2059;
    /** No space left on device (disk full?) */
    readonly FileNoSpaceLeftOnDevice: 2060;
    /** File exceeds file system's maximum file size. */
    readonly FileExceedsFileSystemMaximumSize: 2061;
    /** File transfer connection timeout. */
    readonly FileTransferConnectionTimeout: 2062;
    /** Lost file transfer connection. */
    readonly FileConnectionLost: 2063;
    /** File exceeds supplied file size. */
    readonly FileExceedsSuppliedSize: 2064;
    /** File transfer complete. */
    readonly FileTransferComplete: 2065;
    /** File transfer canceled. */
    readonly FileTransferCanceled: 2066;
    /** File transfer interrupted. */
    readonly FileTransferInterrupted: 2067;
    /** File transfer server quota exceeded. */
    readonly FileTransferServerQuotaExceeded: 2068;
    /** File transfer client quota exceeded. */
    readonly FileTransferClientQuotaExceeded: 2069;
    /** File transfer reset. */
    readonly FileTransferReset: 2070;
    /** File transfer limit reached. */
    readonly FileTransferLimitReached: 2071;
    /** Preprocessor disabled. */
    readonly SoundPreprocessorDisabled: 2304;
    /** Internal preprocessor. */
    readonly SoundInternalPreprocessor: 2305;
    /** Internal encoder. */
    readonly SoundInternalEncoder: 2306;
    /** Internal playback. */
    readonly SoundInternalPlayback: 2307;
    /** No capture device available. */
    readonly SoundNoCaptureDeviceAvailable: 2308;
    /** No playback device available. */
    readonly SoundNoPlaybackDeviceAvailable: 2309;
    /** Could not open capture device. */
    readonly SoundCouldNotOpenCaptureDevice: 2310;
    /** Could not open playback device. */
    readonly SoundCouldNotOpenPlaybackDevice: 2311;
    /** ServerConnectionHandler has a device registered. */
    readonly SoundHandlerHasDevice: 2312;
    /** Invalid capture device. */
    readonly SoundInvalidCaptureDevice: 2313;
    /** Invalid clayback device. */
    readonly SoundInvalidPlaybackDevice: 2314;
    /** Invalid wave file. */
    readonly SoundInvalidWave: 2315;
    /** Wave file type not supported. */
    readonly SoundUnsupportedWave: 2316;
    /** Could not open wave file. */
    readonly SoundOpenWave: 2317;
    /** Internal capture. */
    readonly SoundInternalCapture: 2318;
    /** Device still in use. */
    readonly SoundDeviceInUse: 2319;
    /** Device already registered. */
    readonly SoundDeviceAlreadyRegistered: 2320;
    /** Device not registered/known. */
    readonly SoundUnknownDevice: 2321;
    /** Unsupported frequency. */
    readonly SoundUnsupportedFrequency: 2322;
    /** Invalid channel count. */
    readonly SoundInvalidChannelCount: 2323;
    /** Read error in wave. */
    readonly SoundReadWave: 2324;
    /** Sound need more data. */
    readonly SoundNeedMoreData: 2325;
    /** Sound device was busy. */
    readonly SoundDeviceBusy: 2326;
    /** There is no sound data for this period. */
    readonly SoundNoData: 2327;
    /** Channelmask set bits count (speakers) is not the same as (count) */
    readonly SoundChannelMaskMismatch: 2328;
    /** Invalid group ID. */
    readonly PermissionInvalidGroupID: 2560;
    /** Duplicate entry. */
    readonly PermissionDuplicateEntry: 2561;
    /** Invalid permission ID. */
    readonly PermissionInvalidPermID: 2562;
    /** Empty result set. */
    readonly PermissionEmptyResult: 2563;
    /** Access to default group is forbidden. */
    readonly PermissionDefaultGroupForbidden: 2564;
    /** Invalid size. */
    readonly PermissionInvalidSize: 2565;
    /** Invalid value. */
    readonly PermissionInvalidValue: 2566;
    /** Group is not empty. */
    readonly PermissionsGroupNotEmpty: 2567;
    /** Insufficient client permissions. */
    readonly PermissionsClientInsufficient: 2568;
    /** Insufficient group modify power. */
    readonly PermissionsInsufficientGroupPower: 2569;
    /** Insufficient permission modify power. */
    readonly PermissionsInsufficientPermissionPower: 2570;
    /** Template group is currently used. */
    readonly PermissionTemplateGroupIsUsed: 2571;
    /** Permission error. */
    readonly Permissions: 2572;
    /** Virtualserver limit reached. */
    readonly AccountingVirtualServerLimitReached: 2816;
    /** Max slot limit reached. */
    readonly AccountingSlotLimitReached: 2817;
    /** License file not found. */
    readonly AccountingLicenseFileNotFound: 2818;
    /** License date not ok. */
    readonly AccountingLicenseDateNotOK: 2819;
    /** Unable to connect to accounting server. */
    readonly AccountingUnableToConnectToServer: 2820;
    /** Unknown accounting error. */
    readonly AccountingUnknownError: 2821;
    /** Accounting server error. */
    readonly AccountingServerError: 2822;
    /** Instance limit reached. */
    readonly AccountingInstanceLimitReached: 2823;
    /** Instance check error. */
    readonly AccountingInstanceCheckError: 2824;
    /** License file invalid. */
    readonly AccountingLicenseFileInvalid: 2825;
    /** Virtualserver is running elsewhere. */
    readonly AccountingRunningElsewhere: 2826;
    /** Virtualserver running in same instance already. */
    readonly AccountingInstanceDuplicated: 2827;
    /** Virtualserver already started. */
    readonly AccountingAlreadyStarted: 2828;
    /** Virtualserver not started. */
    readonly AccountingNotStarted: 2829;
    /** No message is known for this code. */
    readonly AccountingTooManyStarts: 2830;
    /** Invalid message id. */
    readonly MessageInvalidID: 3072;
    /** Invalid ban id. */
    readonly BanInvalidID: 3328;
    /** Connection failed, you are banned. */
    readonly ConnectFailedBanned: 3329;
    /** Rename failed, new name is banned. */
    readonly RenameFailedBanned: 3330;
    /** Flood ban. */
    readonly BanFlooding: 3331;
    /** Unable to initialize tts. */
    readonly TTSUnableToInitialize: 3584;
    /** Invalid privilege key. */
    readonly PrivilegeKeyInvalid: 3840;
    /** No message is known for this code. */
    readonly VoipPjsua: 4096;
    /** No message is known for this code. */
    readonly VoipAlreadyInitialized: 4097;
    /** No message is known for this code. */
    readonly VoipTooManyAccounts: 4098;
    /** No message is known for this code. */
    readonly VoipInvalidAccount: 4099;
    /** No message is known for this code. */
    readonly VoipInternalError: 4100;
    /** No message is known for this code. */
    readonly VoipInvalidConnectionID: 4101;
    /** No message is known for this code. */
    readonly VoipCannotAnswerInitiatedCall: 4102;
    /** No message is known for this code. */
    readonly VoipNotInitialized: 4103;
    /** Invalid password. */
    readonly ProvisioningInvalidPassword: 4352;
    /** Invalid request. */
    readonly ProvisioningInvalidRequest: 4353;
    /** No(more) slots available. */
    readonly ProvisioningNoSlotsAvailable: 4354;
    /** Pool missing. */
    readonly ProvisioningPoolMissing: 4355;
    /** Pool unknown. */
    readonly ProvisioningPoolUnknown: 4356;
    /** Unknown ip location(perhaps LAN ip?) */
    readonly ProvisioningUnknownIPLocation: 4357;
    /** Internal error(tried exceeded) */
    readonly ProvisioningInternalTriesExceeded: 4358;
    /** Too many slots requested. */
    readonly ProvisioningTooManySlotsRequested: 4359;
    /** Too many reserved. */
    readonly ProvisioningTooManyReserved: 4360;
    /** Could not connect to provisioning server. */
    readonly ProvisioningCouldNotConnect: 4361;
    /** Authentication server not connected. */
    readonly ProvisioningAuthServerNotConnected: 4368;
    /** Authentication data too large. */
    readonly ProvisioningAuthDataTooLarge: 4369;
    /** Already initialized. */
    readonly ProvisioningAlreadyInitialized: 4370;
    /** Not initialized. */
    readonly ProvisioningNotInitialized: 4371;
    /** Already connecting. */
    readonly ProvisioningConnecting: 4372;
    /** Already connected. */
    readonly ProvisioningAlreadyConnected: 4373;
    /** No message is known for this code. */
    readonly ProvisioningNotConnected: 4374;
    /** Io_error. */
    readonly ProvisioningIOError: 4375;
    /** No message is known for this code. */
    readonly ProvisioningInvalidTimeout: 4376;
    /** No message is known for this code. */
    readonly ProvisioningTS3ServerNotFound: 4377;
    /** Unknown permissionID. */
    readonly ProvisioningNoPermission: 4378;
    /**
     * Out of scope: WebQuery refused a command outside the scope of the api key
     * that made the request, or outside the guest scope of a request that carried
     * none. HTTP 401.
     */
    readonly APIKeyOutOfScope: 5120;
    /**
     * Invalid apikey: WebQuery does not accept the api key sent, or the key may
     * not address the virtual server in the path. HTTP 401.
     */
    readonly APIKeyInvalid: 5122;
    /**
     * Missing apikey: the request carried no api key, or an empty one, and the
     * server offers no guest access. HTTP 401.
     */
    readonly APIKeyMissing: 5124;
    /** Stream does not exist: the id is unknown, or the stream has ended. TeamSpeak 6 only. */
    readonly StreamNotFound: 5635;
    /** You are not participating in this stream: signalling is allowed between the owner and an accepted viewer only. TeamSpeak 6 only. */
    readonly StreamNotParticipating: 5636;
    /** You already joined this stream, whether the request is pending or accepted. TeamSpeak 6 only. */
    readonly StreamAlreadyJoined: 5638;
    /** The join request was redacted: it was answered already, or never made. TeamSpeak 6 only. */
    readonly StreamJoinRequestRedacted: 5639;
};
/**
 * The error codes a TeamSpeak server reports, by name.
 *
 * A {@link ServerError} carries the code as a number, so a caller matches a
 * specific refusal by comparing it:
 *
 * ```ts
 * if (err instanceof ServerError && err.code === ErrorCode.ChannelInvalidPassword) { ... }
 * ```
 *
 * The table holds the codes TeamSpeak 3 and 6 servers share. A server may
 * report a code missing here, so `ServerError.code` is a plain number.
 */
export declare const ErrorCode: typeof errorCodeValues;
/** A known TeamSpeak server error code. */
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
export {};
//# sourceMappingURL=errorcode.d.ts.map