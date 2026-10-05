import axios from "axios";
import { GoogleAuth } from "google-auth-library";

export type ICalendarListEntry = {
    id: string;
    summary?: string;
    accessRole?: string;
};

export type ICalendarListPage = {
    items?: ICalendarListEntry[];
    nextPageToken?: string;
};

export type ICalendarEvent = {
    id: string;
    summary?: string;
    start?: {
        date?: string;
        dateTime?: string;
        timeZone?: string;
    };
    end?: {
        date?: string;
        dateTime?: string;
        timeZone?: string;
    };
};

type ICalendarEventListPage = {
    items?: ICalendarEvent[];
    nextPageToken?: string;
};

const TIMEOUT = 15_000;

const BASE_URL = `https://www.googleapis.com/calendar/v3`;

export class GoogleCalendarApi {
    private readonly auth: GoogleAuth;

    private readonly http = axios.create({
        baseURL: BASE_URL,
        timeout: TIMEOUT,
    });

    constructor(keyFile: string) {
        this.auth = new GoogleAuth({
            keyFile,
            scopes: [
                "https://www.googleapis.com/auth/calendar.calendarlist",
                "https://www.googleapis.com/auth/calendar.events",
            ],
        });
    }

    private async authorizationHeaders() {
        const token = await this.auth.getAccessToken();

        if (!token) {
            throw new Error("Unable to obtain Google access token");
        }

        return { Authorization: `Bearer ${token}` };
    }

    async registerCalendar(calendarId: string): Promise<void> {
        await this.http.post(
            "/users/me/calendarList",
            { id: calendarId },
            { headers: await this.authorizationHeaders() },
        );
    }

    async listCalendars(): Promise<ICalendarListEntry[]> {
        const calendars: ICalendarListEntry[] = [];
        let pageToken: string | undefined;

        do {
            const response = await this.http.get<ICalendarListPage>(
                "/users/me/calendarList",
                {
                    headers: await this.authorizationHeaders(),
                    params: { pageToken, showHidden: true },
                },
            );

            calendars.push(...(response.data.items ?? []));
            pageToken = response.data.nextPageToken;
        } while (pageToken);

        return calendars;
    }

    async listEvents(arg: {
        calendarId: string;
        start: string;
        end: string;
    }): Promise<ICalendarEvent[]> {
        const events: ICalendarEvent[] = [];
        let pageToken: string | undefined;

        do {
            const response = await this.http.get<ICalendarEventListPage>(
                `/calendars/${encodeURIComponent(arg.calendarId)}/events`,
                {
                    headers: await this.authorizationHeaders(),
                    params: {
                        timeMin: arg.start,
                        timeMax: arg.end,
                        pageToken,
                        singleEvents: true,
                        orderBy: "startTime",
                    },
                },
            );

            events.push(...(response.data.items ?? []));
            pageToken = response.data.nextPageToken;
        } while (pageToken);

        return events;
    }
}
