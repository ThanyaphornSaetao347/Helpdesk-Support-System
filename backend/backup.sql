--
-- PostgreSQL database dump
--

-- Dumped from database version 17.4
-- Dumped by pg_dump version 17.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: ticket_notification_notification_type_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.ticket_notification_notification_type_enum AS ENUM (
    'new_ticket',
    'status_change',
    'assignment'
);


ALTER TYPE public.ticket_notification_notification_type_enum OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: customer; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.customer (
    id integer NOT NULL,
    create_date timestamp without time zone DEFAULT now() NOT NULL,
    update_date timestamp without time zone DEFAULT now() NOT NULL,
    update_by integer NOT NULL,
    isenabled boolean DEFAULT true NOT NULL,
    create_by integer NOT NULL,
    name character varying NOT NULL,
    address character varying NOT NULL,
    telephone character varying NOT NULL,
    email character varying NOT NULL,
    status boolean DEFAULT true NOT NULL
);


ALTER TABLE public.customer OWNER TO postgres;

--
-- Name: customer_for_project; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.customer_for_project (
    user_id integer NOT NULL,
    project_id integer NOT NULL,
    isenabled boolean DEFAULT true NOT NULL,
    customer_id integer NOT NULL,
    create_date timestamp without time zone DEFAULT now() NOT NULL,
    create_by integer NOT NULL,
    update_date timestamp without time zone DEFAULT now() NOT NULL,
    update_by integer NOT NULL,
    id integer NOT NULL
);


ALTER TABLE public.customer_for_project OWNER TO postgres;

--
-- Name: customer_for_project_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.customer_for_project_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.customer_for_project_id_seq OWNER TO postgres;

--
-- Name: customer_for_project_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.customer_for_project_id_seq OWNED BY public.customer_for_project.id;


--
-- Name: customer_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.customer_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.customer_id_seq OWNER TO postgres;

--
-- Name: customer_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.customer_id_seq OWNED BY public.customer.id;


--
-- Name: master_role; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.master_role (
    id integer NOT NULL,
    role_name character varying
);


ALTER TABLE public.master_role OWNER TO postgres;

--
-- Name: master_role_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.master_role_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.master_role_id_seq OWNER TO postgres;

--
-- Name: master_role_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.master_role_id_seq OWNED BY public.master_role.id;


--
-- Name: migrations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.migrations (
    id integer NOT NULL,
    "timestamp" bigint NOT NULL,
    name character varying NOT NULL
);


ALTER TABLE public.migrations OWNER TO postgres;

--
-- Name: migrations_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.migrations_id_seq OWNER TO postgres;

--
-- Name: migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.migrations_id_seq OWNED BY public.migrations.id;


--
-- Name: project; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.project (
    id integer NOT NULL,
    create_date timestamp without time zone DEFAULT now() NOT NULL,
    create_by integer NOT NULL,
    isenabled boolean DEFAULT true NOT NULL,
    name character varying NOT NULL,
    status boolean DEFAULT true NOT NULL
);


ALTER TABLE public.project OWNER TO postgres;

--
-- Name: project_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.project_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.project_id_seq OWNER TO postgres;

--
-- Name: project_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.project_id_seq OWNED BY public.project.id;


--
-- Name: ticket; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ticket (
    id integer NOT NULL,
    categories_id integer NOT NULL,
    project_id integer NOT NULL,
    status_id integer DEFAULT 1 NOT NULL,
    close_estimate timestamp without time zone,
    due_date timestamp without time zone,
    create_date timestamp without time zone DEFAULT now() NOT NULL,
    create_by integer NOT NULL,
    update_date timestamp without time zone DEFAULT now() NOT NULL,
    update_by integer NOT NULL,
    isenabled boolean DEFAULT true NOT NULL,
    related_ticket_id character varying(10),
    ticket_no character varying(10),
    issue_description text NOT NULL,
    fix_issue_description text,
    estimate_time character varying,
    lead_time character varying,
    change_request character varying,
    deleted_at timestamp without time zone
);


ALTER TABLE public.ticket OWNER TO postgres;

--
-- Name: ticket_assigned; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ticket_assigned (
    ticket_id integer NOT NULL,
    user_id integer NOT NULL,
    create_date timestamp without time zone DEFAULT now() NOT NULL,
    create_by integer NOT NULL
);


ALTER TABLE public.ticket_assigned OWNER TO postgres;

--
-- Name: ticket_attachment; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ticket_attachment (
    ticket_id integer NOT NULL,
    type character varying(10) NOT NULL,
    extension character varying(10) NOT NULL,
    filename character varying(10) NOT NULL,
    create_date timestamp without time zone DEFAULT now() NOT NULL,
    create_by integer NOT NULL,
    id integer NOT NULL,
    deleted_at timestamp without time zone,
    isenabled boolean DEFAULT true NOT NULL
);


ALTER TABLE public.ticket_attachment OWNER TO postgres;

--
-- Name: ticket_attachment_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.ticket_attachment_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.ticket_attachment_id_seq OWNER TO postgres;

--
-- Name: ticket_attachment_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.ticket_attachment_id_seq OWNED BY public.ticket_attachment.id;


--
-- Name: ticket_categories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ticket_categories (
    id integer NOT NULL,
    create_by integer NOT NULL,
    create_date timestamp without time zone DEFAULT now() NOT NULL,
    isenabled boolean DEFAULT true NOT NULL
);


ALTER TABLE public.ticket_categories OWNER TO postgres;

--
-- Name: ticket_categories_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.ticket_categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.ticket_categories_id_seq OWNER TO postgres;

--
-- Name: ticket_categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.ticket_categories_id_seq OWNED BY public.ticket_categories.id;


--
-- Name: ticket_categories_language; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ticket_categories_language (
    id integer NOT NULL,
    language_id character varying(3) NOT NULL,
    name character varying(255) NOT NULL,
    category_id integer NOT NULL
);


ALTER TABLE public.ticket_categories_language OWNER TO postgres;

--
-- Name: ticket_categories_language_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.ticket_categories_language_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.ticket_categories_language_id_seq OWNER TO postgres;

--
-- Name: ticket_categories_language_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.ticket_categories_language_id_seq OWNED BY public.ticket_categories_language.id;


--
-- Name: ticket_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.ticket_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.ticket_id_seq OWNER TO postgres;

--
-- Name: ticket_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.ticket_id_seq OWNED BY public.ticket.id;


--
-- Name: ticket_notification; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ticket_notification (
    id integer NOT NULL,
    user_id integer NOT NULL,
    status_id integer DEFAULT 1 NOT NULL,
    notification_type public.ticket_notification_notification_type_enum NOT NULL,
    title character varying NOT NULL,
    message text,
    is_read boolean DEFAULT false NOT NULL,
    read_at timestamp without time zone,
    email_sent boolean DEFAULT false NOT NULL,
    email_sent_at timestamp without time zone,
    create_date timestamp without time zone DEFAULT now() NOT NULL,
    update_date timestamp without time zone DEFAULT now() NOT NULL,
    ticket_no character varying NOT NULL
);


ALTER TABLE public.ticket_notification OWNER TO postgres;

--
-- Name: ticket_notification_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.ticket_notification_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.ticket_notification_id_seq OWNER TO postgres;

--
-- Name: ticket_notification_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.ticket_notification_id_seq OWNED BY public.ticket_notification.id;


--
-- Name: ticket_satisfaction; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ticket_satisfaction (
    id integer NOT NULL,
    ticket_id integer NOT NULL,
    rating integer NOT NULL,
    create_by integer NOT NULL,
    create_date timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.ticket_satisfaction OWNER TO postgres;

--
-- Name: ticket_satisfaction_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.ticket_satisfaction_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.ticket_satisfaction_id_seq OWNER TO postgres;

--
-- Name: ticket_satisfaction_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.ticket_satisfaction_id_seq OWNED BY public.ticket_satisfaction.id;


--
-- Name: ticket_status; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ticket_status (
    id integer NOT NULL,
    create_by integer NOT NULL,
    create_date timestamp without time zone DEFAULT now() NOT NULL,
    isenabled boolean DEFAULT true NOT NULL
);


ALTER TABLE public.ticket_status OWNER TO postgres;

--
-- Name: ticket_status_history; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ticket_status_history (
    ticket_id integer NOT NULL,
    status_id integer NOT NULL,
    create_date timestamp without time zone DEFAULT now() NOT NULL,
    create_by integer NOT NULL,
    id integer NOT NULL
);


ALTER TABLE public.ticket_status_history OWNER TO postgres;

--
-- Name: ticket_status_history_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.ticket_status_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.ticket_status_history_id_seq OWNER TO postgres;

--
-- Name: ticket_status_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.ticket_status_history_id_seq OWNED BY public.ticket_status_history.id;


--
-- Name: ticket_status_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.ticket_status_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.ticket_status_id_seq OWNER TO postgres;

--
-- Name: ticket_status_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.ticket_status_id_seq OWNED BY public.ticket_status.id;


--
-- Name: ticket_status_language; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ticket_status_language (
    status_id integer NOT NULL,
    language_id character varying NOT NULL,
    name character varying NOT NULL,
    ticket_id integer
);


ALTER TABLE public.ticket_status_language OWNER TO postgres;

--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id integer NOT NULL,
    password character varying NOT NULL,
    email character varying NOT NULL,
    username character varying NOT NULL,
    firstname character varying NOT NULL,
    lastname character varying NOT NULL,
    phone character varying NOT NULL,
    create_date timestamp without time zone DEFAULT now() NOT NULL,
    create_by integer NOT NULL,
    update_date timestamp without time zone DEFAULT now() NOT NULL,
    update_by integer NOT NULL,
    isenabled boolean DEFAULT true NOT NULL,
    start_date timestamp without time zone DEFAULT now() NOT NULL,
    end_date timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: users_allow_role; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users_allow_role (
    user_id integer NOT NULL,
    role_id integer NOT NULL
);


ALTER TABLE public.users_allow_role OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.users_id_seq OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: customer id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customer ALTER COLUMN id SET DEFAULT nextval('public.customer_id_seq'::regclass);


--
-- Name: customer_for_project id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customer_for_project ALTER COLUMN id SET DEFAULT nextval('public.customer_for_project_id_seq'::regclass);


--
-- Name: master_role id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.master_role ALTER COLUMN id SET DEFAULT nextval('public.master_role_id_seq'::regclass);


--
-- Name: migrations id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.migrations ALTER COLUMN id SET DEFAULT nextval('public.migrations_id_seq'::regclass);


--
-- Name: project id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.project ALTER COLUMN id SET DEFAULT nextval('public.project_id_seq'::regclass);


--
-- Name: ticket id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket ALTER COLUMN id SET DEFAULT nextval('public.ticket_id_seq'::regclass);


--
-- Name: ticket_attachment id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_attachment ALTER COLUMN id SET DEFAULT nextval('public.ticket_attachment_id_seq'::regclass);


--
-- Name: ticket_categories id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_categories ALTER COLUMN id SET DEFAULT nextval('public.ticket_categories_id_seq'::regclass);


--
-- Name: ticket_categories_language id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_categories_language ALTER COLUMN id SET DEFAULT nextval('public.ticket_categories_language_id_seq'::regclass);


--
-- Name: ticket_notification id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_notification ALTER COLUMN id SET DEFAULT nextval('public.ticket_notification_id_seq'::regclass);


--
-- Name: ticket_satisfaction id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_satisfaction ALTER COLUMN id SET DEFAULT nextval('public.ticket_satisfaction_id_seq'::regclass);


--
-- Name: ticket_status id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_status ALTER COLUMN id SET DEFAULT nextval('public.ticket_status_id_seq'::regclass);


--
-- Name: ticket_status_history id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_status_history ALTER COLUMN id SET DEFAULT nextval('public.ticket_status_history_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Data for Name: customer; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.customer (id, create_date, update_date, update_by, isenabled, create_by, name, address, telephone, email, status) FROM stdin;
3	2025-05-20 10:49:36.886119	2025-05-20 10:49:36.886119	38	f	38	Maejo University	66/4 มหาวิทยาลัยแม่โจ้ ตำบลหนองหาร อำเภอสันทราย จังหวัดเชียงใหม่ รหัสไปรษณีย์ 50290	0222222226	maejo@example.com	t
5	2025-05-20 15:29:38.320008	2025-09-18 15:42:13.283	38	t	38	ADC Global	Mars Base One, Sector 7, Olympus Mons, Mars 00001	0999999999	adc@global.com	t
6	2025-09-17 08:49:12.195456	2025-09-22 22:34:45.206	38	t	38	ADC Proline	Lunar Colony District 5, Sea of Tranquility, Moon 11002	0929929292	adc@proline.com	f
4	2025-05-20 15:17:56.511858	2025-05-20 15:17:56.511858	38	t	38	ADC Nova	Titan Research Station, Ring Sector 3, Saturn System 22003	0965438875	adc@nova.com	t
7	2025-09-17 10:41:41.986085	2025-09-24 14:01:57.956	38	t	38	ADC Edge	Orbital Hub 9, Alpha Centauri Outpost, Deep Space 33004	0956321478	adc@edge.com	t
2	2025-05-20 10:47:11.026422	2025-09-25 13:18:50.966	38	t	38	khontumweb	เลขที่ 941 หมู่ที่ 2 ตําบลพระธาตุผาแดง อําเภอแม่สอด จังหวัดตาก 63110	0895541235	khontumweb@example.com	f
\.


--
-- Data for Name: customer_for_project; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.customer_for_project (user_id, project_id, isenabled, customer_id, create_date, create_by, update_date, update_by, id) FROM stdin;
31	2	t	4	2025-05-21 09:59:24.841252	31	2025-05-21 09:59:24.841252	31	8
23	1	t	2	2025-05-21 10:41:13.907452	23	2025-05-21 10:41:13.907452	23	9
31	1	t	2	2025-05-21 13:19:13.094556	31	2025-05-21 13:19:13.094556	31	10
43	5	t	6	2025-09-19 16:30:10.938501	43	2025-09-19 16:30:10.938501	43	13
23	4	t	7	2025-09-24 22:14:18.035789	38	2025-09-24 22:14:18.035789	38	27
44	2	t	5	2025-09-24 22:15:39.141159	38	2025-09-24 22:15:39.141159	38	28
40	2	t	5	2025-09-24 22:15:39.183865	38	2025-09-24 22:15:39.183865	38	29
46	4	t	3	2025-10-02 10:23:24.435097	38	2025-10-02 10:23:24.431	38	33
31	4	t	3	2025-06-26 09:14:12.449664	31	2025-10-02 10:23:24.453	38	12
23	5	f	2	2025-05-26 13:31:15.192989	23	2025-09-17 16:42:20.546	38	11
46	5	f	2	2025-09-25 11:51:14.822	38	2025-09-25 11:51:14.822	38	30
\.


--
-- Data for Name: master_role; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.master_role (id, role_name) FROM stdin;
5	เปลี่ยนสถานะของ ticket
6	ตอบกลับ ticket
7	ปิด ticket
8	แก้ไขปัญหา
1	แจ้งปัญหา
2	ติดตามปัญหา
3	แก้ไข ticket
4	ลบ ticket
9	ผู้รับเรื่อง
11	กู้คืน ticket
12	ดูตั๋วทั้งหมดที่ตัวเองสร้าง
13	ดูตั๋วทั้งหมด
14	ให้คะแนนความพึงพอใจ
15	เพิ่มผู้ใช้
16	ลบผู้ใช้
10	จัดการ project
17	จัดการ category
18	จัดการ status
19	มอบหมายงาน
20	จัดการ customer
\.


--
-- Data for Name: migrations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.migrations (id, "timestamp", name) FROM stdin;
2	1752651255981	InitialMigration1752651255981
3	1757313201322	AddCreateByToCustomer1757313201322
4	1757314764829	RenameColumnExample1757314764829
5	1757908908162	AddNewColumn1757908908162
6	1757928643531	 ชื่อที่ต้องการ1757928643531
7	1757928727016	SetDefualtStatusIdOfNoti1757928727016
8	1757928806126	SetDefualtStatusIdOfNoti1757928806126
10	1758077201829	FixedColumn1758077201829
11	1758077615838	FixTicketCategoriesLanguageId1758077615838
12	1759134511449	AddColumnFolder1759134511449
13	1759138341218	DropColumnFolder1759138341218
\.


--
-- Data for Name: project; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.project (id, create_date, create_by, isenabled, name, status) FROM stdin;
2	2025-05-16 11:29:53.828121	2	t	HRM	t
3	2025-05-16 11:30:05.30648	1	t	CRM	t
4	2025-05-16 11:30:22.546541	1	t	E-office	t
5	2025-09-16 08:55:20.508063	38	t	Maejo University	t
1	2025-05-16 11:29:16.553927	2	t	supportTicket	f
\.


--
-- Data for Name: ticket; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.ticket (id, categories_id, project_id, status_id, close_estimate, due_date, create_date, create_by, update_date, update_by, isenabled, related_ticket_id, ticket_no, issue_description, fix_issue_description, estimate_time, lead_time, change_request, deleted_at) FROM stdin;
131	9	1	5	2025-09-30 16:05:00	2025-09-30 00:00:00	2025-09-09 10:19:32.144	23	2025-09-29 16:06:42.33073	38	t	\N	T250900001	หน้าจอแสดง error ไม่สามารถใช้งานต่อได้	asdfghjkl;'	67	61	\N	\N
130	10	1	3	2025-09-09 11:00:00	2025-09-05 22:40:00	2025-07-11 16:01:23.727	23	2025-10-02 13:21:26.177902	38	t	\N	T250700001	เว็บมีปัญหา ช่วยแก้ไขหน่อย	แก้ไขหน้าเว็บใช้งานไม่ได้	3	4	\N	\N
17	9	2	1	\N	\N	2025-05-27 17:07:25.425	23	2025-05-27 17:07:25.425	23	t	\N	25050010	dsf;sdf;sfkdlskf	\N	\N	\N	\N	\N
18	9	1	1	\N	\N	2025-05-27 17:16:45.997	23	2025-05-27 17:16:45.997	23	t	\N	25050011	error 404 not	\N	\N	\N	\N	\N
19	9	1	1	\N	\N	2025-05-27 17:21:07.071	23	2025-05-27 17:21:07.071	23	t	\N	25050012	error 404 not	\N	\N	\N	\N	\N
20	9	1	1	\N	\N	2025-05-27 17:21:26.152	23	2025-05-27 17:21:26.152	23	t	\N	25050013	hfhfghfghfghfh	\N	\N	\N	\N	\N
21	9	1	1	\N	\N	2025-05-27 17:25:38.686	23	2025-05-27 17:25:38.686	23	t	\N	25050014	sjhslgklsknf	\N	\N	\N	\N	\N
22	9	2	1	\N	\N	2025-05-28 09:11:10.102	31	2025-05-28 09:11:10.102	31	t	\N	25050015	qwertyuiop	\N	\N	\N	\N	\N
23	10	1	1	\N	\N	2025-05-28 09:17:17.701	31	2025-05-28 09:17:17.701	31	t	\N	25050016	หน้าเว็บแตก ช่วยแก้ให้หน่อย	\N	\N	\N	\N	\N
24	9	2	1	\N	\N	2025-05-29 16:52:54.723	31	2025-05-29 16:52:54.723	31	t	\N	68050001	พี่ตู๋อู้งานนนน แอบกินขนมมมม	\N	\N	\N	\N	\N
25	2	1	1	\N	\N	2025-05-30 11:49:57.27	23	2025-05-30 11:49:57.27	23	t	\N	T250500001	ระบบล็อกอินไม่ได้ทำงาน	\N	\N	\N	\N	\N
88	9	1	1	\N	\N	2025-06-06 14:25:03.258	23	2025-07-15 13:07:14.744	23	f	\N	T250660042	klsdljsdfjsdjfksfkdj	\N	\N	\N	\N	\N
30	2	1	1	\N	\N	2025-05-30 13:31:01.443	31	2025-05-30 15:11:28.086	23	t	\N	T250500002	ระบบล็อกอินไม่ได้ทำงาน	\N	\N	\N	\N	\N
39	9	2	5	2025-09-05 16:19:00	2025-09-05 16:19:00	2025-06-02 15:56:58.42	31	2025-09-05 16:18:25.521238	38	t	\N	T250600001	ฟฟฟฟฟฟฟฟฟฟฟฟฟฟฟฟฟฟฟฟฟ	\N	\N	\N	\N	\N
41	9	2	5	2025-09-05 16:19:00	2025-09-05 16:19:00	2025-06-02 16:15:07.417	31	2025-09-05 16:18:25.521238	38	t	\N	T250600001	aaaaaaaaaaaaaaaaaaaa	\N	\N	\N	\N	\N
42	9	1	5	2025-09-05 16:19:00	2025-09-05 16:19:00	2025-06-02 16:20:49.279	31	2025-09-05 16:18:25.521238	38	t	\N	T250600001	aaaaaaaaaaaaaaaaaaaa	\N	\N	\N	\N	\N
33	2	1	5	2025-09-05 16:19:00	2025-09-05 16:19:00	2025-06-02 14:57:45.546	31	2025-09-05 16:18:25.521238	38	t	\N	T250600001	พบปัญหาไม่สามารถ login ได้	\N	\N	\N	\N	\N
38	2	1	5	2025-09-05 16:19:00	2025-09-05 16:19:00	2025-06-02 15:56:38.691	23	2025-09-05 16:18:25.521238	38	t	\N	T250600001	พบปัญหาไม่สามารถ login ได้	\N	\N	\N	\N	\N
89	9	1	2	2025-07-02 12:02:15.931	2025-06-11 14:32:10.371	2025-06-06 14:32:10.371	23	2025-09-02 15:25:47.660168	38	t	\N	T250660043	pfjdfjdghdfhjgfj	ทดสอบการคำนวณเวลาอัตโนมัติ	24	159	\N	\N
129	9	4	5	2025-08-20 14:31:00	2025-08-20 07:00:00	2025-06-26 09:16:21.979	31	2025-09-03 16:54:29.563744	38	t	\N	T250660081	ปุ่มบันทึก	แก้ไขปุ่มบันทึกเรียบร้อย	8	6	\N	\N
125	9	2	2	2025-09-04 02:32:00	\N	2025-06-21 10:29:54.474	23	2025-09-03 22:33:23.176517	38	t	\N	T250660077	หน้าเว็บมีปัญหา ช่วยแก้ไขให้หน่อยได้มั้ย	\N	\N	\N	\N	\N
128	9	1	2	2025-09-19 11:35:00	2025-06-30 16:36:21.479	2025-06-25 16:36:21.479	23	2025-09-24 17:15:08.514597	38	t	\N	T250660080	หน้าเว็บ error ไม่สามารถใช้งานหน้าเว็บได้	เทศๆ มะเขือเทศ มะขามเทศ ประเทศ	24	88	\N	2025-06-27 11:19:20.833
127	10	1	6	\N	\N	2025-06-25 10:26:58.941	23	2025-08-21 16:37:52.419292	33	t	\N	T250660079	ระบบมีปัญหา ช่วยแก้ไขหน่อย	\N	\N	\N	\N	\N
126	9	1	3	2025-09-30 02:00:00	\N	2025-06-24 16:03:18.738	23	2025-09-29 11:50:56.985368	38	t	\N	T250660078	fghlkflhfkljh;ghklg;kjh	\N	491	\N	\N	\N
61	2	1	1	\N	\N	2025-06-03 23:21:56.16	23	2025-06-03 23:21:56.16	23	t	\N	T250660015	พบปัญหาไม่สามารถ login ได้	\N	\N	\N	\N	\N
78	9	2	1	\N	\N	2025-06-06 11:52:28.956	31	2025-06-06 11:52:28.956	31	t	\N	T250660032	asdsdfdfgfgjhjlk;	\N	\N	\N	\N	\N
62	9	2	1	\N	\N	2025-06-03 23:23:33.427	31	2025-06-03 23:23:33.427	31	t	\N	T250660016	ฟฟฟฟฟฟฟฟฟฟฟฟฟฟฟฟฟ	\N	\N	\N	\N	\N
63	9	2	1	\N	\N	2025-06-03 23:25:57.482	31	2025-06-03 23:25:57.482	31	t	\N	T250660017	ฟหกดเ้่าาส	\N	\N	\N	\N	\N
64	9	1	1	\N	\N	2025-06-03 23:30:40.951	31	2025-06-03 23:30:40.951	31	t	\N	T250660018	ฟหสกด้สฟหกา่้่กห้	\N	\N	\N	\N	\N
65	9	2	1	\N	\N	2025-06-04 09:23:29.645	31	2025-06-04 09:23:29.645	31	t	\N	T250660019	qwerttrytyiyuouo	\N	\N	\N	\N	\N
107	9	2	5	2025-09-30 14:00:00	2025-09-30 13:00:00	2025-06-17 14:35:35.328	23	2025-09-29 14:23:09.827353	38	t	\N	T250660059	yuipykm;lbmkopjgorknkfnmpk	\N	8	7	\N	\N
43	2	1	1	\N	\N	2025-06-02 16:22:51.895	23	2025-06-02 16:22:51.895	23	t	\N	T250600002	พบปัญหาไม่สามารถ login ได้	\N	\N	\N	\N	\N
44	2	1	1	\N	\N	2025-06-02 16:25:57.965	23	2025-06-02 16:25:57.965	23	t	\N	25060001	พบปัญหาไม่สามารถ login ได้	\N	\N	\N	\N	\N
45	2	1	1	\N	\N	2025-06-02 16:27:33	23	2025-06-02 16:27:33	23	t	\N	T25060003	พบปัญหาไม่สามารถ login ได้	\N	\N	\N	\N	\N
46	2	1	1	\N	\N	2025-06-02 16:36:29.573	23	2025-06-02 16:36:29.573	23	t	\N	T25060004	พบปัญหาไม่สามารถ login ได้	\N	\N	\N	\N	\N
47	2	1	1	\N	\N	2025-06-02 16:41:37.49	23	2025-06-02 16:41:37.49	23	t	\N	T25060005	พบปัญหาไม่สามารถ login ได้	\N	\N	\N	\N	\N
49	2	1	1	\N	\N	2025-06-02 16:45:32.816	23	2025-06-02 16:45:32.816	23	t	\N	\N	พบปัญหาไม่สามารถ login ได้	\N	\N	\N	\N	\N
50	2	1	1	\N	\N	2025-06-02 21:35:36.731	23	2025-06-02 21:35:36.731	23	t	\N	\N	พบปัญหาไม่สามารถ login ได้	\N	\N	\N	\N	\N
51	2	1	1	\N	\N	2025-06-03 21:04:54.893	23	2025-06-03 21:04:54.893	23	t	\N	\N	พบปัญหาไม่สามารถ login ได้	\N	\N	\N	\N	\N
52	2	1	1	\N	\N	2025-06-03 21:19:44.773	23	2025-06-03 21:19:44.773	23	t	\N	T250660006	พบปัญหาไม่สามารถ login ได้	\N	\N	\N	\N	\N
53	2	1	1	\N	\N	2025-06-03 21:35:10.988	23	2025-06-03 21:35:10.988	23	t	\N	T250660007	พบปัญหาไม่สามารถ login ได้	\N	\N	\N	\N	\N
54	9	2	1	\N	\N	2025-06-03 22:56:02.274	31	2025-06-03 22:56:02.274	31	t	\N	T250660008	ฟฟฟฟฟฟฟฟฟฟฟฟฟฟฟฟฟฟฟฟฟฟฟฟ	\N	\N	\N	\N	\N
55	9	2	1	\N	\N	2025-06-03 23:01:27.912	31	2025-06-03 23:01:27.912	31	t	\N	T250660009	aaaaaaaaaaaaaaaaaaaaaaaaaaa	\N	\N	\N	\N	\N
56	9	2	1	\N	\N	2025-06-03 23:01:58.904	31	2025-06-03 23:01:58.904	31	t	\N	T250660010	aaaaaaaaaaaaaaaaaaaaaaaaaaa	\N	\N	\N	\N	\N
57	9	2	1	\N	\N	2025-06-03 23:03:48.618	31	2025-06-03 23:03:48.618	31	t	\N	T250660011	ไๆำพไพไพไพำไพำไ	\N	\N	\N	\N	\N
58	9	2	1	\N	\N	2025-06-03 23:08:52.241	31	2025-06-03 23:08:52.241	31	t	\N	T250660012	error 404&nbsp;	\N	\N	\N	\N	\N
59	9	2	1	\N	\N	2025-06-03 23:13:09.788	31	2025-06-03 23:13:09.788	31	t	\N	T250660013	aaaaaaaaaaaaaaaa	\N	\N	\N	\N	\N
60	9	2	1	\N	\N	2025-06-03 23:17:46.767	31	2025-06-03 23:17:46.767	31	t	\N	T250660014	aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa	\N	\N	\N	\N	\N
66	9	2	1	\N	\N	2025-06-04 09:32:19.514	31	2025-06-04 09:32:19.514	31	t	\N	T250660020	sssssssssssssssssssssssssssss	\N	\N	\N	\N	\N
67	9	2	1	\N	\N	2025-06-04 09:40:53.246	31	2025-06-04 09:40:53.246	31	t	\N	T250660021	asdfghkjjhlk	\N	\N	\N	\N	\N
68	10	2	1	\N	\N	2025-06-04 09:43:09.693	31	2025-06-04 09:43:09.693	31	t	\N	T250660022	เว็บล่ม ช่วยแก้หน่อย	\N	\N	\N	\N	\N
69	9	2	1	\N	\N	2025-06-04 09:52:28.743	31	2025-06-04 09:52:28.743	31	t	\N	T250660023	qwertytuuyiupoi	\N	\N	\N	\N	\N
70	9	2	1	\N	\N	2025-06-06 10:56:28.051	31	2025-06-06 10:56:28.051	31	t	\N	T250660024	qwertyuiopp	\N	\N	\N	\N	\N
71	9	2	1	\N	\N	2025-06-06 11:07:28.123	31	2025-06-06 11:07:28.123	31	t	\N	T250660025	aaaaaaaaaaaaaaaaaaaa	\N	\N	\N	\N	\N
72	9	1	1	\N	\N	2025-06-06 11:08:48.64	31	2025-06-06 11:08:48.64	31	t	\N	T250660026	ffffffffffffffffffffff	\N	\N	\N	\N	\N
73	9	2	1	\N	\N	2025-06-06 11:11:39.721	31	2025-06-06 11:11:39.721	31	t	\N	T250660027	ฟฟฟฟฟฟฟฟฟฟฟฟฟฟฟฟฟฟฟฟฟฟฟฟ	\N	\N	\N	\N	\N
74	9	2	1	\N	\N	2025-06-06 11:17:22.541	31	2025-06-06 11:17:22.541	31	t	\N	T250660028	zxcvbnm,.asdfghjkl;'	\N	\N	\N	\N	\N
75	9	2	1	\N	\N	2025-06-06 11:27:21.582	31	2025-06-06 11:27:21.582	31	t	\N	T250660029	qweertrtutkjgdhkgd	\N	\N	\N	\N	\N
76	9	1	1	\N	\N	2025-06-06 11:49:40.487	31	2025-06-06 11:49:40.487	31	t	\N	T250660030	สบายสบาย ชิวมากกกกกก	\N	\N	\N	\N	\N
77	9	2	1	\N	\N	2025-06-06 11:50:30.255	31	2025-06-06 11:50:30.255	31	t	\N	T250660031	หหหหหหหหหหหหหหหหหหหหหหหหหหหหหหหหหหหห	\N	\N	\N	\N	\N
79	10	2	1	\N	\N	2025-06-06 11:53:27.691	31	2025-06-06 11:53:27.691	31	t	\N	T250660033	asdfghjklqwertyuiopxcvbnm	\N	\N	\N	\N	\N
80	10	2	1	\N	\N	2025-06-06 12:50:10.514	31	2025-06-06 12:50:10.514	31	t	\N	T250660034	asddfggjjlj;	\N	\N	\N	\N	\N
81	9	2	1	\N	\N	2025-06-06 12:55:31.152	31	2025-06-06 12:55:31.152	31	t	\N	T250660035	assadasdasdasdaads	\N	\N	\N	\N	\N
82	9	2	1	\N	\N	2025-06-06 13:01:17.206	31	2025-06-06 13:01:17.206	31	t	\N	T250660036	a;dosfusyugsbvnrsiosljrns	\N	\N	\N	\N	\N
83	9	2	1	\N	\N	2025-06-06 13:19:23.52	31	2025-06-06 13:19:23.52	31	t	\N	T250660037	srthndghmyrkdy	\N	\N	\N	\N	\N
84	9	2	1	\N	\N	2025-06-06 14:05:15.051	31	2025-06-06 14:05:15.051	31	t	\N	T250660038	dsjlkfhjkdfhkadhgdf	\N	\N	\N	\N	\N
85	9	2	1	\N	\N	2025-06-06 14:05:34.31	31	2025-06-06 14:05:34.31	31	t	\N	T250660039	gjdjgjdkkdfdglgk	\N	\N	\N	\N	\N
86	9	2	1	\N	\N	2025-06-06 14:06:27.236	31	2025-06-06 14:06:27.236	31	t	\N	T250660040	error 400 dsfssf	\N	\N	\N	\N	\N
87	10	1	1	\N	\N	2025-06-06 14:18:50.553	23	2025-06-06 14:18:50.553	23	t	\N	T250660041	error 404 not	\N	\N	\N	\N	\N
90	2	1	1	\N	\N	2025-06-06 16:55:31.365	23	2025-06-06 16:55:31.365	23	t	\N	T250660044	พบปัญหาไม่สามารถ login ได้	\N	\N	\N	\N	\N
96	9	2	1	\N	\N	2025-06-09 14:58:26.335	31	2025-06-09 14:58:26.335	31	t	\N	T250660048	error 404&nbsp;	\N	\N	\N	\N	\N
97	9	2	1	\N	\N	2025-06-09 15:04:12.639	31	2025-06-09 15:04:12.639	31	t	\N	T250660049	erorororrorororororor	\N	\N	\N	\N	\N
101	9	1	1	\N	\N	2025-06-10 09:51:33.701	23	2025-06-10 09:51:33.701	23	t	\N	T250660053	eooeeoapfdsdfsko	\N	\N	\N	\N	\N
102	9	2	1	\N	\N	2025-06-10 14:41:09.833	31	2025-06-10 14:41:09.833	31	t	\N	T250660054	sdfsfsdsfsdfdsfdsd	\N	\N	\N	\N	\N
103	9	2	1	\N	\N	2025-06-10 14:42:51.577	31	2025-06-10 14:42:51.577	31	t	\N	T250660055	shfdjksdshdflhsj	\N	\N	\N	\N	\N
104	9	1	1	\N	\N	2025-06-10 15:22:04.536	23	2025-06-10 15:22:04.536	23	t	\N	T250660056	jshfjsh;glhdgjdagh;fh	\N	\N	\N	\N	\N
106	9	1	1	\N	\N	2025-06-17 13:41:22.081	23	2025-06-17 13:41:22.081	23	t	\N	T250660058	sdhlshlhglishflgdlfihdouh	\N	\N	\N	\N	\N
109	9	1	1	\N	\N	2025-06-17 15:03:42.95	23	2025-06-17 15:03:42.95	23	t	\N	T250660061	vb.cm.vmnuhok,lbmjh;kjl	\N	\N	\N	\N	\N
40	9	2	5	2025-09-05 16:19:00	2025-09-05 16:19:00	2025-06-02 16:12:32.282	31	2025-09-05 16:18:25.521238	38	t	\N	T250600001	aaaaaaaaaaaaaaaaaaaaaa	\N	\N	\N	\N	\N
100	9	2	3	\N	\N	2025-06-09 16:39:33.581	31	2025-09-02 16:35:55.461446	38	t	\N	T250660052	ฟวาด้ำหส่วหเ่ยพ่สากพ่รำพห่	\N	\N	\N	\N	\N
108	9	1	2	\N	\N	2025-06-17 14:36:49.1	23	2025-09-02 16:07:52.753765	38	t	\N	T250660060	bugugugigigiguggugugugugugug	\N	\N	\N	\N	\N
94	2	1	2	\N	\N	2025-06-06 17:03:34.908	23	2025-09-02 17:20:56.019099	38	t	\N	T250660046	พบปัญหาไม่สามารถ login ได้	\N	\N	\N	\N	\N
98	9	2	2	\N	\N	2025-06-09 15:09:27.825	31	2025-09-02 17:23:19.507963	38	t	\N	T250660050	error 404 not&nbsp;	\N	\N	\N	\N	\N
105	9	2	2	\N	\N	2025-06-17 11:53:11.024	31	2025-09-03 16:13:40.586381	38	t	\N	T250660057	erororororororororororoorororordls;lfksldfksdlksl;dflsdfl 'fk'gl;'gj;lg'j;l'tjyj;lj	\N	\N	\N	\N	\N
92	2	1	2	\N	\N	2025-06-06 16:57:33.735	23	2025-09-03 16:22:49.685877	38	t	\N	T250660045	พบปัญหาไม่สามารถ login ได้	\N	\N	\N	\N	\N
99	9	2	2	\N	\N	2025-06-09 15:13:47.348	31	2025-09-03 16:48:12.671772	38	t	\N	T250660051	หยกด่กเสกหเ่ยาหดายหสเว่หเพ	\N	\N	\N	\N	\N
95	9	2	5	2025-09-05 16:22:00	2025-09-05 16:22:00	2025-06-09 14:24:40.116	31	2025-09-05 16:21:42.228942	38	t	\N	T250660047	error 404&nbsp;	แก้ไขหน้าจอ error	5	5	\N	\N
110	9	1	1	\N	\N	2025-06-17 16:19:16.09	23	2025-06-17 16:19:16.09	23	t	\N	T250660062	hkglgkgukhhkkhk3536334848	\N	\N	\N	\N	\N
118	9	1	1	\N	\N	2025-06-19 11:41:31.488	31	2025-06-19 11:41:31.488	31	t	\N	T250660070	sdsdsfdfsfdfsdffdsfdsdffdsdffsd	\N	\N	\N	\N	\N
119	9	2	1	\N	\N	2025-06-19 11:50:29.548	31	2025-06-19 11:50:29.548	31	t	\N	T250660071	ำพนพนพนพนพนพนพนพพนพนพนพนพนพนพนนพน	\N	\N	\N	\N	\N
121	9	1	5	2025-10-02 22:00:00	2025-10-02 09:00:00	2025-06-19 15:43:48.86	23	2025-09-29 14:20:05.647399	38	t	\N	T250660073	หน้าจอ แสดง	แก้ไขหน้าจอ error เรียบร้อย	27	20	\N	\N
115	9	2	3	\N	\N	2025-06-18 14:27:11.355	23	2025-09-03 16:06:42.75849	38	t	\N	T250660067	้างเาทสเ้วสเางเทาวสเงวาวสีม	\N	\N	\N	\N	\N
122	9	1	2	\N	\N	2025-06-19 15:46:27.879	23	2025-09-03 16:56:15.866881	38	t	\N	T250660074	หน้าจอ&nbsp;	\N	\N	\N	\N	\N
117	10	1	2	\N	\N	2025-06-19 10:49:48.712	23	2025-09-08 17:20:50.766102	38	t	\N	T250660069	ระบบหน้าเว็บไซต์ล่ม ช่วยแก้ให้หน่อยได้มั้ย	\N	\N	\N	\N	\N
116	9	2	5	2025-09-30 15:24:00	2025-09-30 14:24:00	2025-06-19 09:32:17.907	31	2025-09-29 14:25:37.877766	38	t	\N	T250660068	lj[plhjklhplphlhklplkp	แก้ไขหน้าจอ Error/ใช้งานต่อไม่ได้	9	8	\N	\N
113	10	2	1	\N	\N	2025-06-17 16:38:37.968	23	2025-10-01 21:18:31.28	23	t	\N	T250660065	ระบบล่ม ไม่สามารถใช้งานเว็บไซต์ได้	\N	\N	\N	\N	\N
120	10	2	1	\N	\N	2025-06-19 11:52:54.298	31	2025-07-09 13:27:35.26	31	f	\N	T250660072	ระบบล่มอีกแล้ว	\N	\N	\N	\N	\N
124	10	1	2	\N	\N	2025-06-21 09:59:05.343	23	2025-09-24 17:16:26.583433	38	t	\N	T250660076	ระบบล่ม ช่วยแก้ไขให้หน่อย	\N	\N	\N	\N	\N
112	9	1	1	\N	\N	2025-06-17 16:37:21.02	23	2025-07-09 15:52:04.392	23	t	\N	T250660064	หน้าเว็บมีปัญหา ไม่สามารถใช้ได้	\N	\N	\N	\N	\N
114	9	2	5	2025-09-30 02:00:00	\N	2025-06-18 14:07:14.652	23	2025-09-29 11:53:49.275611	38	t	\N	T250660066	dfsdfsfdsfsfssfsfsfsfsfsfsf	แก้ไขหน้าจอ Error/ใช้งานต่อไม่ได้	5	\N	\N	\N
111	9	1	1	\N	\N	2025-06-17 16:26:45.335	23	2025-09-01 14:05:45.953865	38	t	\N	T250660063	ย่สบเงัีมาวงดวกเาห้ดอผ้าหเดืสาพหเ้่วพัร้164256+6327642678	\N	\N	\N	\N	\N
123	9	2	5	2025-09-30 02:00:00	2025-10-01 01:00:00	2025-06-20 14:41:54.264	31	2025-09-29 11:57:41.962322	38	t	\N	T250660075	หน้าจอ error	\N	5	13	\N	\N
\.


--
-- Data for Name: ticket_assigned; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.ticket_assigned (ticket_id, user_id, create_date, create_by) FROM stdin;
128	33	2025-07-09 13:46:28.857	33
127	33	2025-08-21 09:43:04.845	38
124	33	2025-09-01 14:01:58.052	38
126	33	2025-09-01 16:23:17.656	38
110	33	2025-09-01 16:27:58.05	38
111	33	2025-09-01 16:33:29.762	38
112	33	2025-09-01 16:38:43.195	38
113	33	2025-09-01 16:40:58.446	38
39	23	2025-09-05 16:18:09.274	38
89	23	2025-09-02 15:00:14.312	38
95	23	2025-09-05 16:21:42.264	38
117	23	2025-09-08 17:20:50.815	38
108	23	2025-09-02 16:07:16.233	38
130	33	2025-09-01 13:59:00.467	38
121	33	2025-09-29 14:18:40.118	38
107	33	2025-09-29 14:22:10.992	38
100	23	2025-09-02 15:31:39.049	38
94	23	2025-09-02 17:20:56.053	38
98	23	2025-09-02 17:23:19.552	38
116	33	2025-09-29 14:24:36.111	38
115	33	2025-09-02 16:05:48.236	38
105	23	2025-09-03 16:13:40.623	38
92	23	2025-09-03 16:22:49.717	38
99	23	2025-09-03 16:48:12.707	38
129	23	2025-09-03 16:54:29.6	38
122	23	2025-09-03 16:56:15.908	38
125	33	2025-09-01 16:21:31.565	38
\.


--
-- Data for Name: ticket_attachment; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.ticket_attachment (ticket_id, type, extension, filename, create_date, create_by, id, deleted_at, isenabled) FROM stdin;
17	reporter	png	17_1	2025-05-27 17:07:25.442075	23	7	\N	t
18	reporter	jpg	18_1	2025-05-27 17:16:46.011281	23	8	\N	t
19	reporter	jpg	19_1	2025-05-27 17:21:07.088917	23	9	\N	t
20	reporter	jpg	20_1	2025-05-27 17:21:26.160455	23	10	\N	t
21	reporter	png	21_1	2025-05-27 17:25:38.698558	23	11	\N	t
22	reporter	png	22_1	2025-05-28 09:11:10.113934	31	12	\N	t
23	reporter	jpg	23_1	2025-05-28 09:17:17.715175	31	13	\N	t
24	reporter	png	24_1	2025-05-29 16:52:54.744326	31	14	\N	t
53	reporter	png	15.png	2025-06-03 21:43:39.055402	23	15	\N	t
61	reporter	png	16.png	2025-06-03 23:22:22.728226	23	16	\N	t
67	reporter	png	temp_17490	2025-06-04 09:41:02.534975	31	17	\N	t
68	reporter	jpg	temp_17490	2025-06-04 09:43:16.731825	31	18	\N	t
68	reporter	png	temp_17490	2025-06-04 09:43:21.354302	31	19	\N	t
69	reporter	jpg	69_1.jpg	2025-06-04 09:52:43.403721	31	20	\N	t
69	reporter	png	69_2.png	2025-06-04 09:52:49.034788	31	21	\N	t
69	reporter	jpg	69_3.jpg	2025-06-04 09:52:50.913979	31	22	\N	t
71	reporter	gif	71_1.gif	2025-06-06 11:07:36.316633	31	23	\N	t
72	reporter	jpg	72_1.jpg	2025-06-06 11:08:53.498834	31	24	\N	t
73	reporter	jpg	73_1.jpg	2025-06-06 11:11:44.205798	31	25	\N	t
73	reporter	gif	73_2.gif	2025-06-06 11:11:48.051191	31	26	\N	t
76	reporter	gif	76_1.gif	2025-06-06 11:49:44.106251	31	27	\N	t
77	reporter	gif	77_1.gif	2025-06-06 11:50:47.786032	31	28	\N	t
78	reporter	gif	78_1.gif	2025-06-06 11:52:38.233919	31	29	\N	t
79	reporter	gif	79_1.gif	2025-06-06 11:53:31.341593	31	30	\N	t
80	reporter	png	80_1.png	2025-06-06 12:50:24.495163	31	31	\N	t
81	reporter	png	81_1.png	2025-06-06 12:55:33.991275	31	32	\N	t
82	reporter	gif	82_1.gif	2025-06-06 13:01:24.15604	31	33	\N	t
82	reporter	png	82_2.png	2025-06-06 13:01:31.329515	31	34	\N	t
82	reporter	jpg	82_3.jpg	2025-06-06 13:01:37.826228	31	35	\N	t
83	reporter	gif	83_1.gif	2025-06-06 13:19:28.730742	31	36	\N	t
83	reporter	png	83_2.png	2025-06-06 13:19:38.647248	31	37	\N	t
85	reporter	jpg	85_1.jpg	2025-06-06 14:05:50.663806	31	38	\N	t
86	reporter	gif	86_1.gif	2025-06-06 14:06:36.983102	31	39	\N	t
87	reporter	jpg	87_1.jpg	2025-06-06 14:19:43.502574	23	40	\N	t
89	reporter	jpg	89_2.jpg	2025-06-06 14:32:34.201781	23	41	\N	t
94	reporter	png	94_1.png	2025-06-06 17:18:24.904688	23	43	\N	t
95	reporter	gif	95_1.gif	2025-06-09 14:24:50.548219	31	44	\N	t
95	reporter	jpg	95_2.jpg	2025-06-09 14:24:56.145564	31	45	\N	t
96	reporter	gif	96_1.gif	2025-06-09 14:58:42.927926	31	46	\N	t
97	reporter	gif	97_1.gif	2025-06-09 15:04:28.831511	31	47	\N	t
98	reporter	gif	98_1.gif	2025-06-09 15:09:51.409749	31	48	\N	t
99	reporter	gif	99_1.gif	2025-06-09 15:20:47.861397	23	49	\N	t
100	reporter	jpg	100_1.jpg	2025-06-09 16:40:16.984302	31	50	\N	t
101	reporter	jpg	101_1.jpg	2025-06-10 09:51:40.273365	23	51	\N	t
101	reporter	jpg	101_2.jpg	2025-06-10 09:56:09.266246	23	52	\N	t
104	reporter	jpg	104_1.jpg	2025-06-10 15:22:34.652323	23	53	\N	t
105	reporter	png	105_1.png	2025-06-17 11:54:10.828729	31	54	\N	t
106	reporter	gif	106_1.gif	2025-06-17 13:41:25.650143	23	55	\N	t
107	reporter	png	107_1.png	2025-06-17 14:35:40.656962	23	56	\N	t
107	reporter	gif	107_2.gif	2025-06-17 14:35:42.838131	23	57	\N	t
108	reporter	png	108_1.png	2025-06-17 14:36:53.16144	23	58	\N	t
108	reporter	jpg	108_2.jpg	2025-06-17 14:37:02.238112	23	59	\N	t
109	reporter	jpg	109_1.jpg	2025-06-17 15:03:47.272306	23	60	\N	t
110	reporter	jpg	110_1.jpg	2025-06-17 16:19:19.744407	23	61	\N	t
111	reporter	jpg	111_1.jpg	2025-06-17 16:26:48.554554	23	62	\N	t
111	reporter	png	111_2.png	2025-06-17 16:26:50.588692	23	63	\N	t
112	reporter	png	112_1.png	2025-06-17 16:37:23.851044	23	64	\N	t
113	reporter	png	113_1.png	2025-06-17 16:39:48.697857	23	65	\N	t
114	reporter	jpg	114_1.jpg	2025-06-18 14:07:17.894548	23	66	\N	t
115	reporter	png	115_1.png	2025-06-18 14:27:13.89386	23	67	\N	t
116	reporter	png	116_1.png	2025-06-19 09:32:20.553888	31	68	\N	t
117	reporter	jpg	117_1.jpg	2025-06-19 10:50:03.568489	23	69	\N	t
118	reporter	gif	118_1.gif	2025-06-19 11:41:37.130231	31	70	\N	t
119	reporter	gif	119_1.gif	2025-06-19 11:50:33.413773	31	71	\N	t
123	reporter	xlsx	123_1.xlsx	2025-06-20 14:42:05.341448	31	73	\N	t
124	reporter	xlsx	124_1.xlsx	2025-06-21 09:59:11.444976	23	74	\N	t
125	reporter	docx	125_1.docx	2025-06-21 10:30:12.606787	23	75	\N	t
126	reporter	docx	126_1.docx	2025-06-24 16:03:24.191476	23	76	\N	t
127	reporter	docx	127_1.docx	2025-06-25 10:27:02.97391	23	77	\N	t
128	reporter	gif	128_1.gif	2025-06-25 16:36:30.639335	23	78	2025-06-27 11:19:20.852	t
122	reporter	png	122_1.png	2025-06-30 20:27:02.342457	23	84	\N	t
121	reporter	pdf	121_1.pdf	2025-07-01 08:40:33.331869	23	86	\N	t
117	reporter	png	117_2.png	2025-07-01 09:28:50.517415	23	89	\N	t
126	reporter	jpg	126_2.jpg	2025-07-01 14:19:20.64485	23	98	\N	t
120	reporter	png	120_1.png	2025-06-19 11:52:57.724846	31	72	2025-07-09 13:27:35.273	f
125	reporter	pdf	125_1.pdf	2025-07-09 15:50:15.207962	23	101	\N	t
112	reporter	png	112_1.png	2025-07-09 15:52:04.919294	23	103	\N	t
89	reporter	png	89_1.png	2025-07-11 11:58:14.866423	23	105	\N	t
129	reporter	jpg	129_1.jpg	2025-07-11 12:02:06.048588	31	106	\N	t
129	reporter	png	129_1.png	2025-06-26 09:16:36.015074	31	79	2025-07-09 13:20:24.465	t
130	reporter	jpg	130_1.jpg	2025-07-11 16:01:30.030516	23	107	\N	t
130	reporter	jpg	130_2.jpg	2025-07-14 11:34:55.642975	23	109	\N	t
129	reporter	png	129_1.png	2025-08-17 21:19:29.463948	33	112	\N	t
129	reporter	png	129_1.png	2025-08-17 21:25:10.120206	33	113	\N	t
61	reporter	png	61_1.png	2025-09-08 16:34:42.623672	38	115	\N	t
131	reporter	jpg	131_1.jpg	2025-09-09 10:33:39.098768	23	116	\N	t
131	reporter	png	131_2.png	2025-09-09 14:07:05.992328	23	120	\N	t
113	reporter	png	113_2.png	2025-09-30 08:55:56.476493	23	124	\N	t
128	supporter	png	128_1.png	2025-09-09 14:10:16.132836	33	121	\N	t
116	supporter	docx	116_1.docx	2025-09-29 14:25:37.94866	38	122	\N	t
131	supporter	jpg	131_1.jpg	2025-09-29 16:06:42.537226	38	123	\N	t
113	supporter	png	113_4.png	2025-09-30 09:04:33.291656	33	126	\N	t
130	supporter	jpg	130_1.jpg	2025-10-02 13:21:26.848273	38	128	\N	t
\.


--
-- Data for Name: ticket_categories; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.ticket_categories (id, create_by, create_date, isenabled) FROM stdin;
11	38	2025-09-16 21:02:19.506	t
12	38	2025-09-16 21:02:35.217	t
13	38	2025-09-17 08:44:29.665	t
15	38	2025-09-17 09:09:30.079	t
16	38	2025-09-17 09:13:25.747	t
17	38	2025-09-17 09:15:41.661	t
18	38	2025-09-17 09:40:52.757	t
1	38	2025-05-24 11:07:06.526532	t
2	38	2025-05-24 13:36:56.546	t
3	38	2025-05-24 13:37:06.497	t
4	38	2025-05-24 13:37:07.55	t
5	38	2025-05-24 13:37:08.231	t
6	38	2025-05-24 13:37:08.798	t
7	38	2025-05-24 13:37:09.357	t
8	38	2025-05-24 13:37:09.862	t
9	38	2025-05-24 13:50:07.758	t
10	38	2025-05-24 13:51:09.427	t
20	38	2025-09-17 10:03:28.597	t
23	38	2025-09-18 20:18:21.107	t
\.


--
-- Data for Name: ticket_categories_language; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.ticket_categories_language (id, language_id, name, category_id) FROM stdin;
16	th	หน้าจอ Error/ใช้งานต่อไม่ได้	9
17	en	Error screen/cannot continue	9
18	th	ระบบล่ม	10
19	en	Downtime	10
1	th	ขอสร้าง/ปรับสิทธิ์ผู้ใช้งาน	20
2	en	User Creation/Permission Changes	20
9	th	การเข้าถึงระบบถูกปฏิเสธ	23
10	en	Access Denied	23
\.


--
-- Data for Name: ticket_notification; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.ticket_notification (id, user_id, status_id, notification_type, title, message, is_read, read_at, email_sent, email_sent_at, create_date, update_date, ticket_no) FROM stdin;
1	23	2	status_change	อัพเดทสถานะ: #125	เรื่องของคุณได้รับการอัพเดทสถานะเป็น: เปิดคำร้อง	f	\N	t	2025-09-30 16:32:32.145	2025-09-30 16:32:28.504	2025-09-30 16:32:32.147361	T250660077
\.


--
-- Data for Name: ticket_satisfaction; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.ticket_satisfaction (id, ticket_id, rating, create_by, create_date) FROM stdin;
1	89	4	33	2025-07-02 13:41:22.993
23	126	5	23	2025-07-21 16:56:13.171
24	39	5	31	2025-09-23 15:02:19.439
\.


--
-- Data for Name: ticket_status; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.ticket_status (id, create_by, create_date, isenabled) FROM stdin;
1	23	2025-06-07 14:28:42.177	t
2	31	2025-06-26 10:22:28.47	t
3	31	2025-06-26 10:23:01.836	t
4	31	2025-06-26 10:23:34.258	t
5	31	2025-06-26 10:23:54.558	t
6	31	2025-06-30 08:42:10.781	t
7	31	2025-06-30 13:27:13.253	t
\.


--
-- Data for Name: ticket_status_history; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.ticket_status_history (ticket_id, status_id, create_date, create_by, id) FROM stdin;
38	1	2025-06-02 15:56:38.691	23	1
39	1	2025-06-02 15:56:58.42	31	2
40	1	2025-06-02 16:12:32.282	31	3
41	1	2025-06-02 16:15:07.417	31	4
42	1	2025-06-02 16:20:49.279	31	5
43	1	2025-06-02 16:22:51.895	23	6
44	1	2025-06-02 16:25:57.965	23	7
45	1	2025-06-02 16:27:33	23	8
46	1	2025-06-02 16:36:29.573	23	9
47	1	2025-06-02 16:41:37.49	23	10
49	1	2025-06-02 16:45:32.816	23	11
50	1	2025-06-02 21:35:36.731	23	12
51	1	2025-06-03 21:04:54.893	23	13
52	1	2025-06-03 21:19:44.773	23	14
53	1	2025-06-03 21:35:10.988	23	15
54	1	2025-06-03 22:56:02.274	31	16
55	1	2025-06-03 23:01:27.912	31	17
56	1	2025-06-03 23:01:58.904	31	18
57	1	2025-06-03 23:03:48.618	31	19
58	1	2025-06-03 23:08:52.241	31	20
59	1	2025-06-03 23:13:09.788	31	21
60	1	2025-06-03 23:17:46.767	31	22
61	1	2025-06-03 23:21:56.16	23	23
62	1	2025-06-03 23:23:33.427	31	24
63	1	2025-06-03 23:25:57.482	31	25
64	1	2025-06-03 23:30:40.951	31	26
65	1	2025-06-04 09:23:29.645	31	27
66	1	2025-06-04 09:32:19.514	31	28
67	1	2025-06-04 09:40:53.246	31	29
68	1	2025-06-04 09:43:09.693	31	30
69	1	2025-06-04 09:52:28.743	31	31
70	1	2025-06-06 10:56:28.051	31	32
71	1	2025-06-06 11:07:28.123	31	33
72	1	2025-06-06 11:08:48.64	31	34
73	1	2025-06-06 11:11:39.721	31	35
74	1	2025-06-06 11:17:22.541	31	36
75	1	2025-06-06 11:27:21.582	31	37
76	1	2025-06-06 11:49:40.487	31	38
77	1	2025-06-06 11:50:30.255	31	39
78	1	2025-06-06 11:52:28.956	31	40
79	1	2025-06-06 11:53:27.691	31	41
80	1	2025-06-06 12:50:10.514	31	42
81	1	2025-06-06 12:55:31.152	31	43
82	1	2025-06-06 13:01:17.206	31	44
83	1	2025-06-06 13:19:23.52	31	45
84	1	2025-06-06 14:05:15.051	31	46
85	1	2025-06-06 14:05:34.31	31	47
86	1	2025-06-06 14:06:27.236	31	48
87	1	2025-06-06 14:18:50.553	23	49
88	1	2025-06-06 14:25:03.258	23	50
89	1	2025-06-06 14:32:10.371	23	51
90	1	2025-06-06 16:55:31.365	23	52
92	1	2025-06-06 16:57:33.735	23	53
94	1	2025-06-06 17:03:34.923	23	55
95	1	2025-06-09 14:24:40.116	31	56
96	1	2025-06-09 14:58:26.335	31	57
97	1	2025-06-09 15:04:12.639	31	58
98	1	2025-06-09 15:09:27.825	31	59
99	1	2025-06-09 15:13:47.348	31	60
100	1	2025-06-09 16:39:33.581	31	61
101	1	2025-06-10 09:51:33.701	23	62
102	1	2025-06-10 14:41:09.833	31	63
103	1	2025-06-10 14:42:51.577	31	64
104	1	2025-06-10 15:22:04.536	23	65
105	1	2025-06-17 11:53:11.024	31	66
106	1	2025-06-17 13:41:22.081	23	67
107	1	2025-06-17 14:35:35.328	23	68
108	1	2025-06-17 14:36:49.1	23	69
109	1	2025-06-17 15:03:42.95	23	70
110	1	2025-06-17 16:19:16.09	23	71
111	1	2025-06-17 16:26:45.335	23	72
112	1	2025-06-17 16:37:21.02	23	73
113	1	2025-06-17 16:38:37.968	23	74
114	1	2025-06-18 14:07:14.652	23	75
115	1	2025-06-18 14:27:11.355	23	76
116	1	2025-06-19 09:32:17.907	31	77
117	1	2025-06-19 10:49:48.712	23	78
118	1	2025-06-19 11:41:31.488	31	79
119	1	2025-06-19 11:50:29.548	31	80
120	1	2025-06-19 11:52:54.298	31	81
121	1	2025-06-19 15:43:48.86	23	82
122	1	2025-06-19 15:46:27.879	23	83
123	1	2025-06-20 14:41:54.264	31	84
124	1	2025-06-21 09:59:05.343	23	85
125	1	2025-06-21 10:29:54.474	23	86
89	2	2025-06-23 14:03:22.657909	31	87
89	2	2025-06-23 14:06:35.038604	31	88
89	3	2025-06-24 10:28:37.802204	31	89
89	2	2025-06-24 15:22:14.685477	31	90
126	1	2025-06-24 16:03:18.738	23	91
89	2	2025-06-25 09:53:51.67237	31	92
127	1	2025-06-25 10:26:58.941	23	93
128	1	2025-06-25 16:36:21.479	23	94
129	1	2025-06-26 09:16:21.979	31	95
129	2	2025-06-26 14:27:20.277	31	105
128	2	2025-07-01 16:36:26.871	31	106
129	3	2025-07-01 16:38:09.615	31	107
89	4	2025-07-02 13:28:04.843	33	108
89	6	2025-07-02 15:41:30.345	23	109
89	4	2025-07-02 15:42:20.197	23	110
127	2	2025-07-02 17:07:26.008	23	111
127	3	2025-07-02 17:07:34.679	23	112
127	4	2025-07-02 17:07:45.531	23	113
127	6	2025-07-02 17:08:51.067	23	114
129	2	2025-07-09 10:20:40.508	33	115
89	2	2025-07-09 10:20:54.201	33	116
126	2	2025-07-09 14:50:08.567	33	117
126	3	2025-07-09 14:50:26.683	33	118
126	4	2025-07-09 14:56:18.901	33	119
126	5	2025-07-09 14:56:35.061	33	120
129	2	2025-07-11 12:06:01.115	33	121
129	2	2025-07-11 12:06:50.383	33	122
129	2	2025-07-11 12:24:10.467	33	123
129	2	2025-07-11 15:36:10.876	33	124
129	2	2025-07-11 15:46:54.116	33	125
128	2	2025-07-11 15:47:16.99	33	126
128	3	2025-07-11 15:48:08.121	33	127
130	1	2025-07-11 16:01:23.727	23	128
129	3	2025-08-20 13:30:45.416	33	133
129	4	2025-08-20 13:32:05.15	33	134
127	2	2025-08-21 16:37:07.886	33	135
127	6	2025-08-21 16:37:52.472	33	136
130	2	2025-09-01 09:41:12.695	38	137
130	2	2025-09-01 09:41:39.025	38	138
130	3	2025-09-01 09:43:25.804	38	139
130	3	2025-09-01 09:51:07.56	38	140
130	2	2025-09-01 10:04:15.151	38	141
130	2	2025-09-01 13:25:33.69	38	142
130	2	2025-09-01 13:26:02.173	38	143
130	2	2025-09-01 13:57:48.01	38	144
124	1	2025-09-01 14:03:08.002	38	145
111	1	2025-09-01 14:04:28.234	38	146
111	1	2025-09-01 14:05:46.099	38	147
130	2	2025-09-01 14:11:38.636	38	148
130	2	2025-09-01 14:20:15.094	38	149
130	2	2025-09-01 14:30:03.812	38	150
130	2	2025-09-01 17:02:06.536	38	151
130	2	2025-09-01 17:02:27.591	38	152
130	3	2025-09-01 17:04:33.052	38	153
130	3	2025-09-02 09:39:54.057	38	154
130	3	2025-09-02 09:40:39.675	38	155
130	3	2025-09-02 09:41:09.658	38	156
130	2	2025-09-02 14:15:37.041	38	157
130	2	2025-09-02 14:16:07.9	38	158
130	3	2025-09-02 14:22:54.281	38	159
130	2	2025-09-02 14:23:35.551	38	160
130	2	2025-09-02 14:24:57.761	38	161
130	2	2025-09-02 14:25:39.351	38	162
130	2	2025-09-02 14:40:09.699	38	163
130	2	2025-09-02 14:41:52.123	38	164
89	2	2025-09-02 14:57:10.314	38	172
89	2	2025-09-02 15:00:14.309	38	173
89	2	2025-09-02 15:04:57.403	38	174
89	2	2025-09-02 15:12:12.258	38	175
89	2	2025-09-02 15:21:46.897	38	176
89	2	2025-09-02 15:25:47.668	38	177
100	2	2025-09-02 15:31:39.047	38	178
100	2	2025-09-02 15:33:03.958	38	179
115	2	2025-09-02 16:05:48.231	38	180
108	2	2025-09-02 16:07:16.231	38	181
108	2	2025-09-02 16:07:52.789	38	182
100	2	2025-09-02 16:29:30.309	38	183
100	3	2025-09-02 16:35:55.494	38	184
94	2	2025-09-02 17:20:56.051	38	185
98	2	2025-09-02 17:23:19.55	38	186
115	3	2025-09-03 15:58:13.514	38	187
115	2	2025-09-03 15:58:25.492	38	188
115	3	2025-09-03 16:06:42.799	38	189
105	2	2025-09-03 16:13:40.621	38	190
92	2	2025-09-03 16:22:49.715	38	191
99	2	2025-09-03 16:48:12.705	38	192
129	5	2025-09-03 16:54:29.597	38	193
122	2	2025-09-03 16:56:15.905	38	194
130	3	2025-09-03 22:29:22.076	38	195
125	2	2025-09-03 22:33:23.208	38	196
130	2	2025-09-03 23:04:54.783	38	197
130	3	2025-09-03 23:07:14.547	38	198
130	2	2025-09-03 23:19:35.58	38	199
130	3	2025-09-03 23:20:13.639	38	200
130	2	2025-09-03 23:20:55.05	38	201
130	3	2025-09-04 09:44:05.847	38	202
130	2	2025-09-04 09:46:03.084	38	203
130	3	2025-09-04 09:49:01.343	38	204
130	2	2025-09-04 10:36:59.485	38	205
130	3	2025-09-04 10:40:04.854	38	206
130	2	2025-09-04 10:47:40.221	38	207
130	3	2025-09-04 10:54:47.882	38	208
130	2	2025-09-04 11:32:29.057	38	209
130	3	2025-09-05 11:33:31.214	38	210
130	2	2025-09-05 11:33:55.219	38	211
130	3	2025-09-05 11:59:44.122	38	212
130	2	2025-09-05 12:02:29.048	38	213
39	2	2025-09-05 16:18:09.268	38	214
39	5	2025-09-05 16:18:25.558	38	215
95	5	2025-09-05 16:21:42.262	38	216
117	2	2025-09-08 17:20:50.809	38	217
130	3	2025-09-09 09:10:17.255	33	218
131	1	2025-09-09 10:19:32.144	23	219
128	2	2025-09-19 11:35:08.973	38	220
131	2	2025-09-19 11:38:13.101	38	221
131	1	2025-09-19 12:51:22.836	38	222
131	2	2025-09-22 22:17:31.552	38	223
130	2	2025-09-24 17:14:03.377	38	224
128	2	2025-09-24 17:15:08.547	38	225
124	2	2025-09-24 17:16:26.619	38	226
131	3	2025-09-24 17:18:38.215	38	227
131	2	2025-09-29 11:41:41.599	38	228
131	5	2025-09-29 11:44:18.243	38	229
131	5	2025-09-29 11:46:09.781	38	230
131	2	2025-09-29 11:48:35.303	38	231
126	2	2025-09-29 11:50:32.362	38	232
126	3	2025-09-29 11:50:57.02	38	233
114	2	2025-09-29 11:51:29.924	38	234
114	3	2025-09-29 11:51:45.995	38	235
114	5	2025-09-29 11:53:49.425	38	236
123	2	2025-09-29 11:56:45.872	38	237
123	3	2025-09-29 11:57:21.378	38	238
123	5	2025-09-29 11:57:41.993	38	239
121	2	2025-09-29 14:18:40.068	38	240
121	3	2025-09-29 14:19:08.194	38	241
121	5	2025-09-29 14:20:05.688	38	242
107	2	2025-09-29 14:22:10.948	38	243
107	3	2025-09-29 14:22:32.012	38	244
107	5	2025-09-29 14:23:09.861	38	245
116	2	2025-09-29 14:24:36.079	38	246
116	3	2025-09-29 14:24:53.155	38	247
116	5	2025-09-29 14:25:37.915	38	248
131	3	2025-09-29 16:06:01.655	38	249
131	5	2025-09-29 16:06:42.361	38	250
130	3	2025-10-02 13:21:26.215	38	251
\.


--
-- Data for Name: ticket_status_language; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.ticket_status_language (status_id, language_id, name, ticket_id) FROM stdin;
1	th	สร้างเสร็จ	\N
1	en	Created	\N
2	th	เปิดคำร้อง	\N
2	en	Open Ticket	\N
3	th	กำลังดำเนินการ	\N
3	en	In Progress	\N
4	en	Resolved	\N
4	th	แก้ไขแล้ว	\N
5	en	Complete	\N
5	th	ดำเนินการเสร็จสิ้น	\N
6	en	Cancel	\N
6	th	ยกเลิก	\N
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, password, email, username, firstname, lastname, phone, create_date, create_by, update_date, update_by, isenabled, start_date, end_date) FROM stdin;
31	$2b$10$YHkuL3KBeOmThfnWepaH1.iUFpJoQIO6m/UZ.d/lpFGoaNBUSfs7m	ant@example.com	ant	Thanyaluck	Sukkasam	022222258	2025-05-20 14:55:27.65208	23	2025-05-20 14:55:27.65208	23	t	2025-05-20 14:55:27.65208	2025-05-20 14:55:27.65208
33	$2b$10$cbTGb6uGMbLiipQuxiWQs.uHvKDp1xr0HjUZ87FVXoB9.MrGGjyh6	top752625@gmail.com	Toptap	Kritchananon	Sangseng	0959599955	2025-07-01 10:45:50.732738	31	2025-07-01 10:45:50.732738	31	t	2025-07-01 10:45:50.732738	2025-07-01 10:45:50.732738
43	$2b$10$7SE1wyzP85JVhQCTlWgAAuOYo1wNueb.sVnq3Drf2Z0EyVvJRgSA2	kritchananon.s@gmail.com	top752625	Kritchananon	Sangseng	0952565115	2025-09-10 16:30:15.168783	38	2025-09-10 16:30:15.168783	38	t	2025-09-10 16:30:15.168783	2025-09-10 16:30:15.168783
44	$2b$10$2vV7JOxWKwG.4BhkrW5T0.L9r3m1DPkR6xkaI6oq5/C0rJEON398u	kim02062546@gmail.com	top02062546	กฤตชนนนท์	สังเส้ง	0952565115	2025-09-10 16:37:49.664345	38	2025-09-10 16:37:49.664345	38	t	2025-09-10 16:37:49.664345	2025-09-10 16:37:49.664345
23	$2b$10$lJM7K.fGm.JgjglF7xzopOfz/rYdbKkdBafQJhwUxa8JjRm8JRftS	tou.thanyaphorn@gmail.com	tootee	Thanyaphorn	Saetao	0222222222	2025-05-15 11:23:58.927433	1	2025-05-15 11:23:58.927433	1	t	2025-05-15 11:23:58.927433	2025-05-15 11:23:58.927433
38	$2b$10$RpXitw2NbkVh0PzT0sq2huJc8bqq9TIpvWN1SrniXUmnvEFcgW6/O	tuo.thanyaphorn@gmail.com	admin	Admin	KTW	0999999996	2025-07-17 14:44:51.811031	1	2025-07-17 14:44:51.811031	1	t	2025-07-17 14:44:51.811031	2025-07-17 14:44:51.811031
46	$2b$10$Y.2Zle1OyrJtep1TE0OteOhueHsecDRV.q3k4kdvkW06GfPTtU3Nq	kn.36100@kanlayanee.ac.th	CAR4M3L	Kritchananon	Sangseng	0952565115	2025-09-21 23:28:55.438595	38	2025-09-21 23:28:55.438595	38	t	2025-09-21 23:28:55.438595	2025-09-21 23:28:55.438595
40	$2b$10$6qJAlPxtt1GXkvu7wsC4XuhL5Qdg5S.x9hrPYkcPfmV1RSrKQkGIq	testuser001@example.com	testuser001	John	Doe	0812345678	2025-09-10 14:13:41.486263	38	2025-09-23 14:32:38.653	38	t	2025-09-10 14:13:41.486263	2025-09-10 14:13:41.486263
\.


--
-- Data for Name: users_allow_role; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users_allow_role (user_id, role_id) FROM stdin;
31	1
31	2
31	3
31	4
31	11
23	1
23	2
23	3
23	4
23	11
33	5
33	6
33	7
33	8
33	9
23	12
31	12
33	13
31	14
23	14
38	2
38	3
38	4
38	5
38	6
38	7
38	10
38	11
38	13
38	15
38	16
38	19
38	18
38	17
40	1
40	2
40	3
40	4
40	11
40	12
40	14
43	1
43	2
43	3
43	4
43	11
43	12
43	14
44	1
44	2
44	3
44	4
44	11
44	12
44	14
38	20
46	1
46	2
46	3
46	4
46	12
46	14
46	11
\.


--
-- Name: customer_for_project_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.customer_for_project_id_seq', 33, true);


--
-- Name: customer_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.customer_id_seq', 7, true);


--
-- Name: master_role_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.master_role_id_seq', 16, true);


--
-- Name: migrations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.migrations_id_seq', 13, true);


--
-- Name: project_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.project_id_seq', 8, true);


--
-- Name: ticket_attachment_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.ticket_attachment_id_seq', 128, true);


--
-- Name: ticket_categories_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.ticket_categories_id_seq', 23, true);


--
-- Name: ticket_categories_language_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.ticket_categories_language_id_seq', 10, true);


--
-- Name: ticket_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.ticket_id_seq', 131, true);


--
-- Name: ticket_notification_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.ticket_notification_id_seq', 1, true);


--
-- Name: ticket_satisfaction_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.ticket_satisfaction_id_seq', 24, true);


--
-- Name: ticket_status_history_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.ticket_status_history_id_seq', 251, true);


--
-- Name: ticket_status_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.ticket_status_id_seq', 7, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.users_id_seq', 47, true);


--
-- Name: ticket_satisfaction PK_2744cca58e5bc7e0045964ee99e; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_satisfaction
    ADD CONSTRAINT "PK_2744cca58e5bc7e0045964ee99e" PRIMARY KEY (id);


--
-- Name: customer_for_project PK_5a97f31e8636d219adefa54d2ef; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customer_for_project
    ADD CONSTRAINT "PK_5a97f31e8636d219adefa54d2ef" PRIMARY KEY (id);


--
-- Name: migrations PK_8c82d7f526340ab734260ea46be; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.migrations
    ADD CONSTRAINT "PK_8c82d7f526340ab734260ea46be" PRIMARY KEY (id);


--
-- Name: ticket_attachment PK_9e42f5e88dde164f4fcf213c592; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_attachment
    ADD CONSTRAINT "PK_9e42f5e88dde164f4fcf213c592" PRIMARY KEY (id);


--
-- Name: ticket_status_history PK_d989dae9e6078a6d4ce1aca63f7; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_status_history
    ADD CONSTRAINT "PK_d989dae9e6078a6d4ce1aca63f7" PRIMARY KEY (id);


--
-- Name: ticket_notification PK_d9ab85d30ed976f2041328eae7a; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_notification
    ADD CONSTRAINT "PK_d9ab85d30ed976f2041328eae7a" PRIMARY KEY (id);


--
-- Name: users UQ_97672ac88f789774dd47f7c8be3; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE (email);


--
-- Name: users UQ_fe0bb3f6520ee0469504521e710; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "UQ_fe0bb3f6520ee0469504521e710" UNIQUE (username);


--
-- Name: customer customer_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customer
    ADD CONSTRAINT customer_pkey PRIMARY KEY (id);


--
-- Name: master_role master_role_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.master_role
    ADD CONSTRAINT master_role_pkey PRIMARY KEY (id);


--
-- Name: project project_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.project
    ADD CONSTRAINT project_pkey PRIMARY KEY (id);


--
-- Name: ticket_assigned ticket_assigned_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_assigned
    ADD CONSTRAINT ticket_assigned_pkey PRIMARY KEY (ticket_id);


--
-- Name: ticket_categories_language ticket_categories_language_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_categories_language
    ADD CONSTRAINT ticket_categories_language_pkey PRIMARY KEY (id, category_id, language_id);


--
-- Name: ticket_categories ticket_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_categories
    ADD CONSTRAINT ticket_categories_pkey PRIMARY KEY (id);


--
-- Name: ticket ticket_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket
    ADD CONSTRAINT ticket_pkey PRIMARY KEY (id);


--
-- Name: ticket_status_language ticket_status_language_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_status_language
    ADD CONSTRAINT ticket_status_language_pkey PRIMARY KEY (status_id, language_id);


--
-- Name: ticket_status ticket_status_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_status
    ADD CONSTRAINT ticket_status_pkey PRIMARY KEY (id);


--
-- Name: users_allow_role users_allow_role_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users_allow_role
    ADD CONSTRAINT users_allow_role_pkey PRIMARY KEY (user_id, role_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: IDX_2bf802bfb1c8689ac24d181e4c; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IDX_2bf802bfb1c8689ac24d181e4c" ON public.users_allow_role USING btree (role_id);


--
-- Name: IDX_668beb57a0e0ab6a979380af56; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IDX_668beb57a0e0ab6a979380af56" ON public.users_allow_role USING btree (user_id);


--
-- Name: ticket_status_language FK_05843a206580cf0017e9db393c8; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_status_language
    ADD CONSTRAINT "FK_05843a206580cf0017e9db393c8" FOREIGN KEY (ticket_id) REFERENCES public.ticket_status(id);


--
-- Name: customer_for_project FK_07bb7c3f39996ad727a3dd59452; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customer_for_project
    ADD CONSTRAINT "FK_07bb7c3f39996ad727a3dd59452" FOREIGN KEY (project_id) REFERENCES public.project(id);


--
-- Name: ticket FK_17cc52872004472c7a8125fd789; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket
    ADD CONSTRAINT "FK_17cc52872004472c7a8125fd789" FOREIGN KEY (project_id) REFERENCES public.project(id);


--
-- Name: ticket_satisfaction FK_1f15c0fd51d9250df77e989492b; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_satisfaction
    ADD CONSTRAINT "FK_1f15c0fd51d9250df77e989492b" FOREIGN KEY (ticket_id) REFERENCES public.ticket(id);


--
-- Name: ticket_attachment FK_26664df6b12d840fbf8945e1c41; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_attachment
    ADD CONSTRAINT "FK_26664df6b12d840fbf8945e1c41" FOREIGN KEY (ticket_id) REFERENCES public.ticket(id) ON DELETE CASCADE;


--
-- Name: users_allow_role FK_2bf802bfb1c8689ac24d181e4ca; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users_allow_role
    ADD CONSTRAINT "FK_2bf802bfb1c8689ac24d181e4ca" FOREIGN KEY (role_id) REFERENCES public.master_role(id);


--
-- Name: ticket_status_history FK_42be96b83b41ecbe8fb2c8313dd; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_status_history
    ADD CONSTRAINT "FK_42be96b83b41ecbe8fb2c8313dd" FOREIGN KEY (status_id) REFERENCES public.ticket_status(id);


--
-- Name: ticket_categories_language FK_44eb4270c5cc90f6e85fc20e350; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_categories_language
    ADD CONSTRAINT "FK_44eb4270c5cc90f6e85fc20e350" FOREIGN KEY (category_id) REFERENCES public.ticket_categories(id);


--
-- Name: ticket_notification FK_4cb92ebbaa5722242954c09162e; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_notification
    ADD CONSTRAINT "FK_4cb92ebbaa5722242954c09162e" FOREIGN KEY (status_id) REFERENCES public.ticket_status(id);


--
-- Name: ticket_status_history FK_52fa10cddeab4cf9d490c387a6c; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_status_history
    ADD CONSTRAINT "FK_52fa10cddeab4cf9d490c387a6c" FOREIGN KEY (ticket_id) REFERENCES public.ticket(id);


--
-- Name: ticket_assigned FK_546e65ae8ae92e47fc52095b8af; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_assigned
    ADD CONSTRAINT "FK_546e65ae8ae92e47fc52095b8af" FOREIGN KEY (create_by) REFERENCES public.users(id);


--
-- Name: users_allow_role FK_668beb57a0e0ab6a979380af563; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users_allow_role
    ADD CONSTRAINT "FK_668beb57a0e0ab6a979380af563" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: customer_for_project FK_6ab6bc0b1a4f7b0bb78052ebd32; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customer_for_project
    ADD CONSTRAINT "FK_6ab6bc0b1a4f7b0bb78052ebd32" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: ticket FK_6e0ee8248a3915067d3f4b64b10; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket
    ADD CONSTRAINT "FK_6e0ee8248a3915067d3f4b64b10" FOREIGN KEY (categories_id) REFERENCES public.ticket_categories(id);


--
-- Name: ticket FK_71f44b2f1b780e8ae0aec266939; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket
    ADD CONSTRAINT "FK_71f44b2f1b780e8ae0aec266939" FOREIGN KEY (create_by) REFERENCES public.users(id);


--
-- Name: ticket_notification FK_9360ebd65f766c667e8199cdea1; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_notification
    ADD CONSTRAINT "FK_9360ebd65f766c667e8199cdea1" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: ticket_assigned FK_9962d671babee57eeae4f987a4c; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_assigned
    ADD CONSTRAINT "FK_9962d671babee57eeae4f987a4c" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: ticket FK_a39055e902c270197f3711e0ee3; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket
    ADD CONSTRAINT "FK_a39055e902c270197f3711e0ee3" FOREIGN KEY (status_id) REFERENCES public.ticket_status(id);


--
-- Name: ticket_assigned FK_bf75e2b139fcc8a9e579ceae4d2; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_assigned
    ADD CONSTRAINT "FK_bf75e2b139fcc8a9e579ceae4d2" FOREIGN KEY (ticket_id) REFERENCES public.ticket(id);


--
-- Name: customer_for_project FK_c1cd78b4ffd814968db8af4ae45; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customer_for_project
    ADD CONSTRAINT "FK_c1cd78b4ffd814968db8af4ae45" FOREIGN KEY (customer_id) REFERENCES public.customer(id);


--
-- PostgreSQL database dump complete
--

