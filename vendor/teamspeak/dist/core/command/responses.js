/**
 * Where each command's answer actually arrives.
 *
 * ServerQuery answers a query with nameless rows followed by `error`. The voice
 * protocol often does not: it answers `servergrouplist` with a named
 * `notifyservergrouplist` command, `clientgetuidfromclid` with
 * `notifyclientuidfromclid`, and so on. A client that only collects nameless
 * rows reports an empty success for every one of those — which this SDK did,
 * and documented as a property of the protocol.
 *
 * Most notifications carry no return_code, so nothing on the wire ties one to
 * the command that caused it; the two stream notifications that answer
 * `setupstream` and `requeststreaminfo` are the exceptions and echo it, and
 * `setupstream` is matched on that echo. The
 * pairing is a property of the command, and this table is where it lives. It was measured command by command
 * against TS3 3.13.8 and TS6 6.0.0-beta13.1, which answer identically — see
 * scripts/probe-response-shapes.mts to re-run that measurement.
 *
 * Commands not listed answer with nameless rows, or with nothing.
 */
const inline = (...notifications) => ({ notifications });
/** An inline answer that is also sent unprompted, for any `key` the request names. */
const echoing = (notification, key) => ({
    notifications: [notification],
    echoKey: key,
});
const fileTransfer = (answer) => ({
    correlated: {
        notifications: [answer, "notifystatusfiletransfer"],
        key: "clientftfid",
        failure: "notifystatusfiletransfer",
    },
});
/** The table behind {@link responseSpec}, by command name; exported for the tests that check it against the name tables. */
export const RESPONSES = {
    apikeyadd: inline("notifyapikeyadd"),
    apikeylist: inline("notifyapikeylist"),
    banfind: inline("notifybanfind"),
    banlist: inline("notifybanlist"),
    channelclientpermlist: inline("notifychannelclientpermlist"),
    channelcreate: { notifications: ["notifychannelcreated"], ownRowsOnly: true },
    channelgetdescription: echoing("notifychanneledited", "cid"),
    channelgroupadd: inline("notifychannelgrouplist"),
    channelgroupclientlist: inline("notifychannelgroupclientlist"),
    channelgroupcopy: inline("notifychannelgrouplist"),
    channelgrouplist: inline("notifychannelgrouplist"),
    channelgrouppermlist: inline("notifychannelgrouppermlist"),
    channelpermlist: inline("notifychannelpermlist"),
    clientdbfind: inline("notifyclientdbfind"),
    clientdblist: inline("notifyclientdblist"),
    clientgetdbidfromuid: inline("notifyclientdbidfromuid"),
    clientgetids: inline("notifyclientids"),
    clientgetnamefromdbid: inline("notifyclientnamefromdbid"),
    clientgetnamefromuid: inline("notifyclientnamefromuid"),
    clientgetuidfromclid: inline("notifyclientuidfromclid"),
    clientgetvariables: echoing("notifyclientupdated", "clid"),
    clientsetserverquerylogin: inline("notifyclientserverqueryloginpassword"),
    clientpermlist: inline("notifyclientpermlist"),
    complainlist: inline("notifycomplainlist"),
    // Matched on the echoed `clid`, wherever the row falls against the `error`:
    // TeamSpeak 6 sent `error id=0` ahead of the `notifyconnectioninfo` row in
    // about 3% of the commands (6 of 240) when four were in flight at once, never
    // with one at a time (over 800 sequential commands, both servers); TeamSpeak
    // 3 never did. Rows for the same client also arrive unprompted, when the
    // target answers the server's `notifyconnectioninforequest`, so a row's
    // position says nothing about which command it answers; the echo does.
    getconnectioninfo: {
        correlated: { notifications: ["notifyconnectioninfo"], key: "clid" },
    },
    ftgetfileinfo: inline("notifyfileinfo"),
    ftgetfilelist: inline("notifyfilelist"),
    ftinitdownload: fileTransfer("notifystartdownload"),
    ftinitupload: fileTransfer("notifystartupload"),
    ftlist: inline("notifyfiletransferlist"),
    logview: inline("notifyserverlog"),
    messageget: inline("notifymessage"),
    messagelist: inline("notifymessagelist"),
    permfind: inline("notifypermfind"),
    permget: inline("notifypermget"),
    permissionlist: inline("notifypermissionlist"),
    permoverview: inline("notifypermoverview"),
    privilegekeyadd: inline("notifytokenadd"),
    privilegekeylist: inline("notifytokenlist"),
    servergetvariables: inline("notifyserverupdated"),
    servergroupadd: inline("notifyservergrouplist"),
    servergroupclientlist: inline("notifyservergroupclientlist"),
    servergroupcopy: inline("notifyservergrouplist"),
    servergrouplist: inline("notifyservergrouplist"),
    servergrouppermlist: inline("notifyservergrouppermlist"),
    servergroupsbyclientid: inline("notifyservergroupsbyclientid"),
    serverrequestconnectioninfo: inline("notifyserverconnectioninfo"),
    servertemppasswordlist: inline("notifyservertemppasswordlist"),
    // Announced to every client in the channel, the stream's own copy included;
    // only the publisher's carries the `return_code`, and it arrives ahead of
    // the `error` (measured on TeamSpeak 6 6.0.0-beta13.1: 500 of 500), which
    // the match does not depend on. Streams with the same name cannot be told
    // apart any other way.
    setupstream: { correlated: { notifications: ["notifystreamstarted"], key: "return_code" } },
    tokenadd: inline("notifytokenadd"),
    tokenlist: inline("notifytokenlist"),
};
/** The response shape of a command, or undefined for plain rows. */
export function responseSpec(command) {
    return Object.hasOwn(RESPONSES, command) ? RESPONSES[command] : undefined;
}
//# sourceMappingURL=responses.js.map