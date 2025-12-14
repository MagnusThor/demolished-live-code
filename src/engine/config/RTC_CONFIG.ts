
export const RTC_CONFIG: RTCConfiguration = {
    "iceTransportPolicy": "all",
    "rtcpMuxPolicy": "require",
    "bundlePolicy": "max-bundle",
    "iceServers": [
        {
            "urls": "stun:stun.l.google.com:19302"
        }
    ]
};
