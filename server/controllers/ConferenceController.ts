import {
    BrokerController,
    CanInvoke,
    Connection,
    ControllerProperties,
} from 'thor-io.vnext';


@ControllerProperties("conferenceController", (1000 * 30))
export class ConferenceController extends BrokerController {
    constructor(connection: Connection) {
        super(connection);
    }
}