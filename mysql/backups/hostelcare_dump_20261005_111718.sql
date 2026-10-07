-- MySQL dump 10.13  Distrib 8.0.45, for Win64 (x86_64)
--
-- Host: localhost    Database: hostelcare
-- ------------------------------------------------------
-- Server version	8.0.45

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `complaint_categories`
--

DROP TABLE IF EXISTS `complaint_categories`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `complaint_categories` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(50) NOT NULL,
  `default_severity` enum('Low','Medium','High','Critical') NOT NULL DEFAULT 'Medium',
  `sla_hours` int NOT NULL DEFAULT '48',
  `description` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `complaint_categories`
--

LOCK TABLES `complaint_categories` WRITE;
/*!40000 ALTER TABLE `complaint_categories` DISABLE KEYS */;
INSERT INTO `complaint_categories` VALUES (1,'Electrical','Medium',24,'Electrical appliances, switches, fans, lights'),(2,'Plumbing','High',12,'Water supply, pipe leakage, washroom fittings'),(3,'Internet/WiFi','Medium',24,'Hostel WiFi routers and LAN connectivity'),(4,'Carpentry','Low',48,'Beds, tables, cupboards, doors and window repairs'),(5,'Cleaning','Low',24,'Room cleaning, corridors, and waste disposal'),(6,'Other','Medium',48,'General and miscellaneous hostel maintenance');
/*!40000 ALTER TABLE `complaint_categories` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `complaint_history`
--

DROP TABLE IF EXISTS `complaint_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `complaint_history` (
  `id` int NOT NULL AUTO_INCREMENT,
  `complaint_id` int NOT NULL,
  `note` varchar(255) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_history_complaint_id` (`complaint_id`),
  CONSTRAINT `complaint_history_ibfk_1` FOREIGN KEY (`complaint_id`) REFERENCES `complaints` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=58 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `complaint_history`
--

LOCK TABLES `complaint_history` WRITE;
/*!40000 ALTER TABLE `complaint_history` DISABLE KEYS */;
INSERT INTO `complaint_history` VALUES (1,1,'Complaint submitted by Kshitij Bhate (Medium severity, auto-bound from category)','2026-09-22 10:26:12'),(2,2,'Complaint submitted by Kshitij Bhate (Medium severity, auto-bound from category)','2026-09-22 10:26:16'),(3,3,'Complaint submitted by Kshitij Bhate (Medium severity, auto-bound from category)','2026-09-22 10:26:17'),(4,4,'Complaint submitted by Kshitij Bhate (Medium severity, auto-bound from category)','2026-09-22 10:26:17'),(5,5,'Complaint submitted by Kshitij Bhate (Medium severity, auto-bound from category)','2026-09-22 10:26:17'),(6,6,'Complaint submitted by Kshitij Bhate (Medium severity, auto-bound from category)','2026-09-22 10:26:17'),(7,7,'Complaint submitted by Kshitij Bhate (Medium severity, auto-bound from category)','2026-09-22 10:26:19'),(8,8,'Complaint submitted by Kshitij Bhate (Medium severity, auto-bound from category)','2026-09-22 10:26:19'),(9,8,'Severity changed from Medium to Critical by Warden A','2026-09-22 10:27:08'),(10,8,'Assigned to Maintenance Staff A by Warden A','2026-09-22 10:27:22'),(11,8,'Marked done by Maintenance Staff A, awaiting warden review','2026-09-22 10:27:51'),(12,8,'Escalated to Chief Warden (vhb) — by Warden A','2026-09-22 10:28:14'),(13,8,'Escalated to College Authority (vhb) — by Warden A','2026-09-22 10:28:16'),(14,7,'Escalated to Chief Warden (dsxfc) — by Warden A','2026-09-22 10:28:28'),(15,7,'Escalated to College Authority (dsxfc) — by Warden A','2026-09-22 10:28:31'),(16,7,'Escalated to Principal (dsxfc) — by Warden A','2026-09-22 10:28:36'),(17,1,'Escalated to Chief Warden (ad) — by Warden A','2026-09-22 10:29:14'),(18,9,'Complaint submitted by Tushar (Medium severity, auto-bound from category)','2026-09-22 10:30:26'),(19,1,'Marked resolved by Chief Warden','2026-09-22 10:31:14'),(20,10,'Complaint submitted by Tushar (Medium severity, auto-bound from category)','2026-09-22 10:31:51'),(21,10,'Escalated to Chief Warden (sdfxv) — by Warden A','2026-09-22 10:32:35'),(22,10,'Escalated to College Authority (hvachb) — by Chief Warden','2026-09-22 10:33:03'),(23,8,'Escalated to Principal (awgdj) — by College Authority','2026-09-22 10:33:57'),(24,11,'Complaint submitted by Tushar (Medium severity, auto-bound from category)','2026-09-22 10:37:33'),(25,2,'Escalated to Chief Warden (SLA breach (auto)) — by System','2026-09-23 11:26:23'),(26,3,'Escalated to Chief Warden (SLA breach (auto)) — by System','2026-09-23 11:26:30'),(27,4,'Escalated to Chief Warden (SLA breach (auto)) — by System','2026-09-23 11:26:36'),(28,5,'Escalated to Chief Warden (SLA breach (auto)) — by System','2026-09-23 11:26:41'),(29,6,'Escalated to Chief Warden (SLA breach (auto)) — by System','2026-09-23 11:26:46'),(30,9,'Escalated to Chief Warden (SLA breach (auto)) — by System','2026-09-23 11:26:50'),(31,11,'Escalated to Chief Warden (SLA breach (auto)) — by System','2026-09-23 11:26:56'),(32,12,'Complaint submitted by Tushar (Low severity, auto-bound from category)','2026-09-23 14:18:51'),(33,2,'Escalated to College Authority (SLA breach (auto)) — by System','2026-10-03 14:23:54'),(34,2,'Escalated to Principal (SLA breach (auto)) — by System','2026-10-03 14:24:02'),(35,3,'Escalated to College Authority (SLA breach (auto)) — by System','2026-10-03 14:24:07'),(36,3,'Escalated to Principal (SLA breach (auto)) — by System','2026-10-03 14:24:11'),(37,4,'Escalated to College Authority (SLA breach (auto)) — by System','2026-10-03 14:24:16'),(38,4,'Escalated to Principal (SLA breach (auto)) — by System','2026-10-03 14:24:20'),(39,5,'Escalated to College Authority (SLA breach (auto)) — by System','2026-10-03 14:24:25'),(40,5,'Escalated to Principal (SLA breach (auto)) — by System','2026-10-03 14:24:30'),(41,6,'Escalated to College Authority (SLA breach (auto)) — by System','2026-10-03 14:24:35'),(42,6,'Escalated to Principal (SLA breach (auto)) — by System','2026-10-03 14:24:39'),(43,9,'Escalated to College Authority (SLA breach (auto)) — by System','2026-10-03 14:25:38'),(44,9,'Escalated to Principal (SLA breach (auto)) — by System','2026-10-03 14:25:45'),(45,10,'Escalated to Principal (SLA breach (auto)) — by System','2026-10-03 14:25:50'),(46,11,'Escalated to College Authority (SLA breach (auto)) — by System','2026-10-03 14:25:56'),(47,11,'Escalated to Principal (SLA breach (auto)) — by System','2026-10-03 14:26:02'),(48,12,'Escalated to Chief Warden (SLA breach (auto)) — by System','2026-10-03 14:26:07'),(49,12,'Escalated to Chief Warden (SLA breach (auto)) — by System','2026-10-03 14:26:07'),(50,12,'Escalated to College Authority (SLA breach (auto)) — by System','2026-10-03 14:26:10'),(51,12,'Escalated to College Authority (SLA breach (auto)) — by System','2026-10-03 14:26:11'),(52,12,'Escalated to College Authority (SLA breach (auto)) — by System','2026-10-03 14:26:12'),(53,12,'Escalated to Principal (SLA breach (auto)) — by System','2026-10-03 14:26:15'),(54,12,'Escalated to Principal (SLA breach (auto)) — by System','2026-10-03 14:26:16'),(55,12,'Escalated to Principal (SLA breach (auto)) — by System','2026-10-03 14:26:17'),(56,13,'Complaint submitted by Tushar (Medium severity, auto-bound from category)','2026-10-03 14:27:19'),(57,13,'Escalated to Chief Warden (Abc) — by Warden A','2026-10-03 14:27:46');
/*!40000 ALTER TABLE `complaint_history` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `complaints`
--

DROP TABLE IF EXISTS `complaints`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `complaints` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(150) NOT NULL,
  `category` varchar(50) NOT NULL,
  `severity` enum('Low','Medium','High','Critical') NOT NULL,
  `description` text,
  `photo` varchar(255) DEFAULT NULL,
  `completion_photo` varchar(255) DEFAULT NULL,
  `status` enum('Pending','Assigned','Under Review','Resolved') NOT NULL DEFAULT 'Pending',
  `student_id` int NOT NULL,
  `hostel_block` varchar(100) DEFAULT NULL,
  `assigned_to` int DEFAULT NULL,
  `escalation_level` tinyint NOT NULL DEFAULT '0',
  `response_due_at` timestamp NULL DEFAULT NULL,
  `resolution_due_at` timestamp NULL DEFAULT NULL,
  `final_due_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `category_id` int DEFAULT NULL,
  `block_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `category_id` (`category_id`),
  KEY `block_id` (`block_id`),
  KEY `idx_complaints_status` (`status`),
  KEY `idx_complaints_severity` (`severity`),
  KEY `idx_complaints_escalation` (`escalation_level`),
  KEY `idx_complaints_student_id` (`student_id`),
  KEY `idx_complaints_assigned_to` (`assigned_to`),
  KEY `idx_complaints_created_at` (`created_at`),
  KEY `idx_complaints_student_status` (`student_id`,`status`),
  CONSTRAINT `complaints_ibfk_1` FOREIGN KEY (`student_id`) REFERENCES `users` (`id`),
  CONSTRAINT `complaints_ibfk_2` FOREIGN KEY (`assigned_to`) REFERENCES `users` (`id`),
  CONSTRAINT `complaints_ibfk_3` FOREIGN KEY (`category_id`) REFERENCES `complaint_categories` (`id`) ON DELETE SET NULL,
  CONSTRAINT `complaints_ibfk_4` FOREIGN KEY (`block_id`) REFERENCES `hostel_blocks` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `complaints`
--

LOCK TABLES `complaints` WRITE;
/*!40000 ALTER TABLE `complaints` DISABLE KEYS */;
INSERT INTO `complaints` VALUES (1,'Electric','Electrical','Medium','xdgnn',NULL,NULL,'Resolved',10,'Devgiri Boys Hostel',NULL,1,'2026-09-22 16:26:12','2026-09-24 10:26:12','2026-09-26 10:26:12','2026-09-22 10:26:12',1,1),(2,'Electric','Electrical','Medium','xdgnn',NULL,NULL,'Pending',10,'Devgiri Boys Hostel',NULL,3,'2026-09-22 16:26:15','2026-09-24 10:26:15','2026-09-26 10:26:15','2026-09-22 10:26:16',1,1),(3,'Electric','Electrical','Medium','xdgnn',NULL,NULL,'Pending',10,'Devgiri Boys Hostel',NULL,3,'2026-09-22 16:26:17','2026-09-24 10:26:17','2026-09-26 10:26:17','2026-09-22 10:26:17',1,1),(4,'Electric','Electrical','Medium','xdgnn',NULL,NULL,'Pending',10,'Devgiri Boys Hostel',NULL,3,'2026-09-22 16:26:17','2026-09-24 10:26:17','2026-09-26 10:26:17','2026-09-22 10:26:17',1,1),(5,'Electric','Electrical','Medium','xdgnn',NULL,NULL,'Pending',10,'Devgiri Boys Hostel',NULL,3,'2026-09-22 16:26:17','2026-09-24 10:26:17','2026-09-26 10:26:17','2026-09-22 10:26:17',1,1),(6,'Electric','Electrical','Medium','xdgnn',NULL,NULL,'Pending',10,'Devgiri Boys Hostel',NULL,3,'2026-09-22 16:26:17','2026-09-24 10:26:17','2026-09-26 10:26:17','2026-09-22 10:26:17',1,1),(7,'Electric','Electrical','Medium','xdgnn',NULL,NULL,'Pending',10,'Devgiri Boys Hostel',NULL,3,'2026-09-22 16:26:18','2026-09-24 10:26:18','2026-09-26 10:26:18','2026-09-22 10:26:19',1,1),(8,'Electric','Electrical','Critical','xdgnn',NULL,NULL,'Under Review',10,'Devgiri Boys Hostel',7,3,'2026-09-22 10:57:08','2026-09-22 16:27:08','2026-09-22 22:27:08','2026-09-22 10:26:19',1,1),(9,'Washroom','Electrical','Medium','abc',NULL,NULL,'Pending',1,'Devgiri Boys Hostel',NULL,3,'2026-09-22 16:30:26','2026-09-24 10:30:26','2026-09-26 10:30:26','2026-09-22 10:30:26',1,1),(10,'Electric','Electrical','Medium','gfcfgv',NULL,NULL,'Pending',1,'Devgiri Boys Hostel',NULL,3,'2026-09-22 16:31:51','2026-09-24 10:31:51','2026-09-26 10:31:51','2026-09-22 10:31:51',1,1),(11,'Electric','Electrical','Medium','Electric',NULL,NULL,'Pending',1,'Devgiri Boys Hostel',NULL,3,'2026-09-22 16:37:33','2026-09-24 10:37:33','2026-09-26 10:37:33','2026-09-22 10:37:33',1,1),(12,'WIFI','Internet/WiFi','Low','wifi Problem in room no 205 B wing',NULL,NULL,'Pending',1,'Devgiri Boys Hostel',NULL,3,'2026-09-24 02:18:51','2026-09-26 14:18:51','2026-09-29 14:18:51','2026-09-23 14:18:51',3,1),(13,'Electric','Electrical','Medium','aa',NULL,NULL,'Pending',1,'Devgiri Boys Hostel',NULL,1,'2026-10-03 20:27:18','2026-10-05 14:27:18','2026-10-07 14:27:18','2026-10-03 14:27:19',1,1);
/*!40000 ALTER TABLE `complaints` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `escalations`
--

DROP TABLE IF EXISTS `escalations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `escalations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `complaint_id` int NOT NULL,
  `level` tinyint NOT NULL,
  `escalated_to_role` varchar(30) NOT NULL,
  `reason` varchar(255) NOT NULL,
  `triggered_by` varchar(20) NOT NULL DEFAULT 'system',
  `triggered_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_escalations_complaint_id` (`complaint_id`),
  CONSTRAINT `escalations_ibfk_1` FOREIGN KEY (`complaint_id`) REFERENCES `complaints` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=41 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `escalations`
--

LOCK TABLES `escalations` WRITE;
/*!40000 ALTER TABLE `escalations` DISABLE KEYS */;
INSERT INTO `escalations` VALUES (1,8,1,'chief_warden','vhb','3','2026-09-22 10:28:14'),(2,8,2,'college_authority','vhb','3','2026-09-22 10:28:16'),(3,7,1,'chief_warden','dsxfc','3','2026-09-22 10:28:28'),(4,7,2,'college_authority','dsxfc','3','2026-09-22 10:28:31'),(5,7,3,'principal','dsxfc','3','2026-09-22 10:28:36'),(6,1,1,'chief_warden','ad','3','2026-09-22 10:29:14'),(7,10,1,'chief_warden','sdfxv','3','2026-09-22 10:32:35'),(8,10,2,'college_authority','hvachb','4','2026-09-22 10:33:03'),(9,8,3,'principal','awgdj','5','2026-09-22 10:33:57'),(10,2,1,'chief_warden','SLA breach (auto)','system','2026-09-23 11:26:23'),(11,3,1,'chief_warden','SLA breach (auto)','system','2026-09-23 11:26:30'),(12,4,1,'chief_warden','SLA breach (auto)','system','2026-09-23 11:26:36'),(13,5,1,'chief_warden','SLA breach (auto)','system','2026-09-23 11:26:40'),(14,6,1,'chief_warden','SLA breach (auto)','system','2026-09-23 11:26:45'),(15,9,1,'chief_warden','SLA breach (auto)','system','2026-09-23 11:26:50'),(16,11,1,'chief_warden','SLA breach (auto)','system','2026-09-23 11:26:55'),(17,2,2,'college_authority','SLA breach (auto)','system','2026-10-03 14:23:54'),(18,2,3,'principal','SLA breach (auto)','system','2026-10-03 14:24:02'),(19,3,2,'college_authority','SLA breach (auto)','system','2026-10-03 14:24:07'),(20,3,3,'principal','SLA breach (auto)','system','2026-10-03 14:24:11'),(21,4,2,'college_authority','SLA breach (auto)','system','2026-10-03 14:24:16'),(22,4,3,'principal','SLA breach (auto)','system','2026-10-03 14:24:20'),(23,5,2,'college_authority','SLA breach (auto)','system','2026-10-03 14:24:25'),(24,5,3,'principal','SLA breach (auto)','system','2026-10-03 14:24:30'),(25,6,2,'college_authority','SLA breach (auto)','system','2026-10-03 14:24:35'),(26,6,3,'principal','SLA breach (auto)','system','2026-10-03 14:24:39'),(27,9,2,'college_authority','SLA breach (auto)','system','2026-10-03 14:25:37'),(28,9,3,'principal','SLA breach (auto)','system','2026-10-03 14:25:45'),(29,10,3,'principal','SLA breach (auto)','system','2026-10-03 14:25:50'),(30,11,2,'college_authority','SLA breach (auto)','system','2026-10-03 14:25:56'),(31,11,3,'principal','SLA breach (auto)','system','2026-10-03 14:26:02'),(32,12,1,'chief_warden','SLA breach (auto)','system','2026-10-03 14:26:06'),(33,12,1,'chief_warden','SLA breach (auto)','system','2026-10-03 14:26:07'),(34,12,2,'college_authority','SLA breach (auto)','system','2026-10-03 14:26:10'),(35,12,2,'college_authority','SLA breach (auto)','system','2026-10-03 14:26:11'),(36,12,2,'college_authority','SLA breach (auto)','system','2026-10-03 14:26:12'),(37,12,3,'principal','SLA breach (auto)','system','2026-10-03 14:26:15'),(38,12,3,'principal','SLA breach (auto)','system','2026-10-03 14:26:16'),(39,12,3,'principal','SLA breach (auto)','system','2026-10-03 14:26:16'),(40,13,1,'chief_warden','Abc','3','2026-10-03 14:27:45');
/*!40000 ALTER TABLE `escalations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `hostel_blocks`
--

DROP TABLE IF EXISTS `hostel_blocks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `hostel_blocks` (
  `id` int NOT NULL AUTO_INCREMENT,
  `block_code` varchar(20) NOT NULL,
  `block_name` varchar(100) NOT NULL,
  `total_rooms` int DEFAULT '100',
  `warden_id` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `block_code` (`block_code`),
  KEY `fk_hostel_blocks_warden` (`warden_id`),
  CONSTRAINT `fk_hostel_blocks_warden` FOREIGN KEY (`warden_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `hostel_blocks_ibfk_1` FOREIGN KEY (`warden_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `hostel_blocks`
--

LOCK TABLES `hostel_blocks` WRITE;
/*!40000 ALTER TABLE `hostel_blocks` DISABLE KEYS */;
INSERT INTO `hostel_blocks` VALUES (1,'DEVGIRI','Devgiri Boys Hostel',120,3,'2026-10-05 05:46:04'),(2,'SAHYADRI','Sahyadri Boys Hostel',100,NULL,'2026-10-05 05:46:04'),(3,'SHIVNERI','Shivneri Girls Hostel',100,NULL,'2026-10-05 05:46:04');
/*!40000 ALTER TABLE `hostel_blocks` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `notifications`
--

DROP TABLE IF EXISTS `notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notifications` (
  `id` int NOT NULL AUTO_INCREMENT,
  `complaint_id` int NOT NULL,
  `role` varchar(30) NOT NULL,
  `email` varchar(100) NOT NULL,
  `subject` varchar(255) NOT NULL,
  `status` enum('sent','failed','skipped') NOT NULL,
  `sent_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_notifications_complaint_id` (`complaint_id`),
  KEY `idx_notifications_status` (`status`),
  CONSTRAINT `notifications_ibfk_1` FOREIGN KEY (`complaint_id`) REFERENCES `complaints` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=91 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notifications`
--

LOCK TABLES `notifications` WRITE;
/*!40000 ALTER TABLE `notifications` DISABLE KEYS */;
INSERT INTO `notifications` VALUES (1,1,'student','kshitijbhate2024.comp@mmcoe.edu.in','[HostelCare] Complaint #1 status: Pending','sent','2026-09-22 10:26:19'),(2,2,'student','kshitijbhate2024.comp@mmcoe.edu.in','[HostelCare] Complaint #2 status: Pending','sent','2026-09-22 10:26:21'),(3,3,'student','kshitijbhate2024.comp@mmcoe.edu.in','[HostelCare] Complaint #3 status: Pending','sent','2026-09-22 10:26:21'),(4,4,'student','kshitijbhate2024.comp@mmcoe.edu.in','[HostelCare] Complaint #4 status: Pending','sent','2026-09-22 10:26:22'),(5,5,'student','kshitijbhate2024.comp@mmcoe.edu.in','[HostelCare] Complaint #5 status: Pending','sent','2026-09-22 10:26:22'),(6,6,'student','kshitijbhate2024.comp@mmcoe.edu.in','[HostelCare] Complaint #6 status: Pending','sent','2026-09-22 10:26:22'),(7,7,'student','kshitijbhate2024.comp@mmcoe.edu.in','[HostelCare] Complaint #7 status: Pending','sent','2026-09-22 10:26:24'),(8,8,'student','kshitijbhate2024.comp@mmcoe.edu.in','[HostelCare] Complaint #8 status: Pending','sent','2026-09-22 10:26:26'),(9,8,'student','kshitijbhate2024.comp@mmcoe.edu.in','[HostelCare] Complaint #8 status: Assigned','sent','2026-09-22 10:27:27'),(10,8,'student','kshitijbhate2024.comp@mmcoe.edu.in','[HostelCare] Complaint #8 status: Under Review','sent','2026-09-22 10:27:57'),(11,8,'student','kshitijbhate2024.comp@mmcoe.edu.in','[HostelCare] Complaint #8 escalated to Chief Warden','sent','2026-09-22 10:28:20'),(12,8,'chief_warden','chiefwarden@replace-me.hostelcare.local','[HostelCare] Complaint #8 escalated to Chief Warden','skipped','2026-09-22 10:28:20'),(13,8,'student','kshitijbhate2024.comp@mmcoe.edu.in','[HostelCare] Complaint #8 escalated to College Authority','sent','2026-09-22 10:28:21'),(14,8,'college_authority','authority@replace-me.hostelcare.local','[HostelCare] Complaint #8 escalated to College Authority','skipped','2026-09-22 10:28:21'),(15,7,'student','kshitijbhate2024.comp@mmcoe.edu.in','[HostelCare] Complaint #7 escalated to Chief Warden','sent','2026-09-22 10:28:37'),(16,7,'chief_warden','chiefwarden@replace-me.hostelcare.local','[HostelCare] Complaint #7 escalated to Chief Warden','skipped','2026-09-22 10:28:37'),(17,7,'student','kshitijbhate2024.comp@mmcoe.edu.in','[HostelCare] Complaint #7 escalated to College Authority','sent','2026-09-22 10:28:39'),(18,7,'college_authority','authority@replace-me.hostelcare.local','[HostelCare] Complaint #7 escalated to College Authority','skipped','2026-09-22 10:28:39'),(19,7,'student','kshitijbhate2024.comp@mmcoe.edu.in','[HostelCare] Complaint #7 escalated to Principal','sent','2026-09-22 10:28:43'),(20,7,'principal','principal@replace-me.hostelcare.local','[HostelCare] Complaint #7 escalated to Principal','skipped','2026-09-22 10:28:43'),(21,1,'student','kshitijbhate2024.comp@mmcoe.edu.in','[HostelCare] Complaint #1 escalated to Chief Warden','sent','2026-09-22 10:29:20'),(22,1,'chief_warden','chiefwarden@replace-me.hostelcare.local','[HostelCare] Complaint #1 escalated to Chief Warden','skipped','2026-09-22 10:29:20'),(23,9,'student','tusharborate2024.comp@mmcoe.edu.in','[HostelCare] Complaint #9 status: Pending','sent','2026-09-22 10:30:32'),(24,1,'student','kshitijbhate2024.comp@mmcoe.edu.in','[HostelCare] Complaint #1 status: Resolved','sent','2026-09-22 10:31:20'),(25,10,'student','tusharborate2024.comp@mmcoe.edu.in','[HostelCare] Complaint #10 status: Pending','sent','2026-09-22 10:31:57'),(26,10,'student','tusharborate2024.comp@mmcoe.edu.in','[HostelCare] Complaint #10 escalated to Chief Warden','sent','2026-09-22 10:32:49'),(27,10,'chief_warden','chiefwarden@replace-me.hostelcare.local','[HostelCare] Complaint #10 escalated to Chief Warden','skipped','2026-09-22 10:32:49'),(28,10,'student','tusharborate2024.comp@mmcoe.edu.in','[HostelCare] Complaint #10 escalated to College Authority','sent','2026-09-22 10:33:11'),(29,10,'college_authority','authority@replace-me.hostelcare.local','[HostelCare] Complaint #10 escalated to College Authority','skipped','2026-09-22 10:33:11'),(30,8,'student','kshitijbhate2024.comp@mmcoe.edu.in','[HostelCare] Complaint #8 escalated to Principal','sent','2026-09-22 10:34:03'),(31,8,'principal','principal@replace-me.hostelcare.local','[HostelCare] Complaint #8 escalated to Principal','skipped','2026-09-22 10:34:03'),(32,11,'student','tusharborate2024.comp@mmcoe.edu.in','[HostelCare] Complaint #11 status: Pending','sent','2026-09-22 10:37:39'),(33,2,'student','kshitijbhate2024.comp@mmcoe.edu.in','[HostelCare] Complaint #2 escalated to Chief Warden','sent','2026-09-23 11:26:30'),(34,2,'chief_warden','chiefwarden@replace-me.hostelcare.local','[HostelCare] Complaint #2 escalated to Chief Warden','skipped','2026-09-23 11:26:30'),(35,3,'student','kshitijbhate2024.comp@mmcoe.edu.in','[HostelCare] Complaint #3 escalated to Chief Warden','sent','2026-09-23 11:26:35'),(36,3,'chief_warden','chiefwarden@replace-me.hostelcare.local','[HostelCare] Complaint #3 escalated to Chief Warden','skipped','2026-09-23 11:26:35'),(37,4,'student','kshitijbhate2024.comp@mmcoe.edu.in','[HostelCare] Complaint #4 escalated to Chief Warden','sent','2026-09-23 11:26:40'),(38,4,'chief_warden','chiefwarden@replace-me.hostelcare.local','[HostelCare] Complaint #4 escalated to Chief Warden','skipped','2026-09-23 11:26:40'),(39,5,'student','kshitijbhate2024.comp@mmcoe.edu.in','[HostelCare] Complaint #5 escalated to Chief Warden','sent','2026-09-23 11:26:45'),(40,5,'chief_warden','chiefwarden@replace-me.hostelcare.local','[HostelCare] Complaint #5 escalated to Chief Warden','skipped','2026-09-23 11:26:45'),(41,6,'student','kshitijbhate2024.comp@mmcoe.edu.in','[HostelCare] Complaint #6 escalated to Chief Warden','sent','2026-09-23 11:26:50'),(42,6,'chief_warden','chiefwarden@replace-me.hostelcare.local','[HostelCare] Complaint #6 escalated to Chief Warden','skipped','2026-09-23 11:26:50'),(43,9,'student','tusharborate2024.comp@mmcoe.edu.in','[HostelCare] Complaint #9 escalated to Chief Warden','sent','2026-09-23 11:26:55'),(44,9,'chief_warden','chiefwarden@replace-me.hostelcare.local','[HostelCare] Complaint #9 escalated to Chief Warden','skipped','2026-09-23 11:26:55'),(45,11,'student','tusharborate2024.comp@mmcoe.edu.in','[HostelCare] Complaint #11 escalated to Chief Warden','sent','2026-09-23 11:27:00'),(46,11,'chief_warden','chiefwarden@replace-me.hostelcare.local','[HostelCare] Complaint #11 escalated to Chief Warden','skipped','2026-09-23 11:27:00'),(47,12,'student','tusharborate2024.comp@mmcoe.edu.in','[HostelCare] Complaint #12 status: Pending','sent','2026-09-23 14:18:57'),(48,2,'student','kshitijbhate2024.comp@mmcoe.edu.in','[HostelCare] Complaint #2 escalated to Principal','sent','2026-10-03 14:24:07'),(49,2,'principal','principal@replace-me.hostelcare.local','[HostelCare] Complaint #2 escalated to Principal','skipped','2026-10-03 14:24:07'),(50,3,'student','kshitijbhate2024.comp@mmcoe.edu.in','[HostelCare] Complaint #3 escalated to College Authority','sent','2026-10-03 14:24:11'),(51,3,'college_authority','authority@replace-me.hostelcare.local','[HostelCare] Complaint #3 escalated to College Authority','skipped','2026-10-03 14:24:11'),(52,3,'student','kshitijbhate2024.comp@mmcoe.edu.in','[HostelCare] Complaint #3 escalated to Principal','sent','2026-10-03 14:24:16'),(53,3,'principal','principal@replace-me.hostelcare.local','[HostelCare] Complaint #3 escalated to Principal','skipped','2026-10-03 14:24:16'),(54,4,'student','kshitijbhate2024.comp@mmcoe.edu.in','[HostelCare] Complaint #4 escalated to College Authority','sent','2026-10-03 14:24:20'),(55,4,'college_authority','authority@replace-me.hostelcare.local','[HostelCare] Complaint #4 escalated to College Authority','skipped','2026-10-03 14:24:20'),(56,4,'student','kshitijbhate2024.comp@mmcoe.edu.in','[HostelCare] Complaint #4 escalated to Principal','sent','2026-10-03 14:24:25'),(57,4,'principal','principal@replace-me.hostelcare.local','[HostelCare] Complaint #4 escalated to Principal','skipped','2026-10-03 14:24:25'),(58,5,'student','kshitijbhate2024.comp@mmcoe.edu.in','[HostelCare] Complaint #5 escalated to College Authority','sent','2026-10-03 14:24:30'),(59,5,'college_authority','authority@replace-me.hostelcare.local','[HostelCare] Complaint #5 escalated to College Authority','skipped','2026-10-03 14:24:30'),(60,5,'student','kshitijbhate2024.comp@mmcoe.edu.in','[HostelCare] Complaint #5 escalated to Principal','sent','2026-10-03 14:24:35'),(61,5,'principal','principal@replace-me.hostelcare.local','[HostelCare] Complaint #5 escalated to Principal','skipped','2026-10-03 14:24:35'),(62,6,'student','kshitijbhate2024.comp@mmcoe.edu.in','[HostelCare] Complaint #6 escalated to College Authority','sent','2026-10-03 14:24:39'),(63,6,'college_authority','authority@replace-me.hostelcare.local','[HostelCare] Complaint #6 escalated to College Authority','skipped','2026-10-03 14:24:39'),(64,9,'student','tusharborate2024.comp@mmcoe.edu.in','[HostelCare] Complaint #9 escalated to College Authority','sent','2026-10-03 14:25:45'),(65,9,'college_authority','authority@replace-me.hostelcare.local','[HostelCare] Complaint #9 escalated to College Authority','skipped','2026-10-03 14:25:45'),(66,9,'student','tusharborate2024.comp@mmcoe.edu.in','[HostelCare] Complaint #9 escalated to Principal','sent','2026-10-03 14:25:50'),(67,9,'principal','principal@replace-me.hostelcare.local','[HostelCare] Complaint #9 escalated to Principal','skipped','2026-10-03 14:25:50'),(68,10,'student','tusharborate2024.comp@mmcoe.edu.in','[HostelCare] Complaint #10 escalated to Principal','sent','2026-10-03 14:25:55'),(69,10,'principal','principal@replace-me.hostelcare.local','[HostelCare] Complaint #10 escalated to Principal','skipped','2026-10-03 14:25:55'),(70,11,'student','tusharborate2024.comp@mmcoe.edu.in','[HostelCare] Complaint #11 escalated to College Authority','sent','2026-10-03 14:26:02'),(71,11,'college_authority','authority@replace-me.hostelcare.local','[HostelCare] Complaint #11 escalated to College Authority','skipped','2026-10-03 14:26:02'),(72,11,'student','tusharborate2024.comp@mmcoe.edu.in','[HostelCare] Complaint #11 escalated to Principal','sent','2026-10-03 14:26:07'),(73,11,'principal','principal@replace-me.hostelcare.local','[HostelCare] Complaint #11 escalated to Principal','skipped','2026-10-03 14:26:07'),(74,12,'student','tusharborate2024.comp@mmcoe.edu.in','[HostelCare] Complaint #12 escalated to Chief Warden','sent','2026-10-03 14:26:11'),(75,12,'chief_warden','chiefwarden@replace-me.hostelcare.local','[HostelCare] Complaint #12 escalated to Chief Warden','skipped','2026-10-03 14:26:11'),(76,12,'student','tusharborate2024.comp@mmcoe.edu.in','[HostelCare] Complaint #12 escalated to Chief Warden','sent','2026-10-03 14:26:11'),(77,12,'chief_warden','chiefwarden@replace-me.hostelcare.local','[HostelCare] Complaint #12 escalated to Chief Warden','skipped','2026-10-03 14:26:11'),(78,12,'student','tusharborate2024.comp@mmcoe.edu.in','[HostelCare] Complaint #12 escalated to College Authority','sent','2026-10-03 14:26:15'),(79,12,'college_authority','authority@replace-me.hostelcare.local','[HostelCare] Complaint #12 escalated to College Authority','skipped','2026-10-03 14:26:15'),(80,12,'student','tusharborate2024.comp@mmcoe.edu.in','[HostelCare] Complaint #12 escalated to College Authority','sent','2026-10-03 14:26:16'),(81,12,'college_authority','authority@replace-me.hostelcare.local','[HostelCare] Complaint #12 escalated to College Authority','skipped','2026-10-03 14:26:16'),(82,12,'student','tusharborate2024.comp@mmcoe.edu.in','[HostelCare] Complaint #12 escalated to College Authority','sent','2026-10-03 14:26:16'),(83,12,'college_authority','authority@replace-me.hostelcare.local','[HostelCare] Complaint #12 escalated to College Authority','skipped','2026-10-03 14:26:16'),(84,12,'student','tusharborate2024.comp@mmcoe.edu.in','[HostelCare] Complaint #12 escalated to Principal','sent','2026-10-03 14:26:19'),(85,12,'principal','principal@replace-me.hostelcare.local','[HostelCare] Complaint #12 escalated to Principal','skipped','2026-10-03 14:26:20'),(86,12,'student','tusharborate2024.comp@mmcoe.edu.in','[HostelCare] Complaint #12 escalated to Principal','failed','2026-10-03 14:27:01'),(87,12,'principal','principal@replace-me.hostelcare.local','[HostelCare] Complaint #12 escalated to Principal','skipped','2026-10-03 14:27:02'),(88,13,'student','tusharborate2024.comp@mmcoe.edu.in','[HostelCare] Complaint #13 status: Pending','sent','2026-10-03 14:27:27'),(89,13,'student','tusharborate2024.comp@mmcoe.edu.in','[HostelCare] Complaint #13 escalated to Chief Warden','sent','2026-10-03 14:27:51'),(90,13,'chief_warden','chiefwarden@replace-me.hostelcare.local','[HostelCare] Complaint #13 escalated to Chief Warden','skipped','2026-10-03 14:27:51');
/*!40000 ALTER TABLE `notifications` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `pending_registrations`
--

DROP TABLE IF EXISTS `pending_registrations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pending_registrations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `prn` varchar(20) NOT NULL,
  `email` varchar(100) NOT NULL,
  `password` varchar(255) NOT NULL,
  `block` varchar(100) NOT NULL,
  `status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `rejection_reason` varchar(255) DEFAULT NULL,
  `requested_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `block_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `block_id` (`block_id`),
  KEY `idx_pending_status` (`status`),
  CONSTRAINT `pending_registrations_ibfk_1` FOREIGN KEY (`block_id`) REFERENCES `hostel_blocks` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `pending_registrations`
--

LOCK TABLES `pending_registrations` WRITE;
/*!40000 ALTER TABLE `pending_registrations` DISABLE KEYS */;
INSERT INTO `pending_registrations` VALUES (1,'Kshitij Bhate','B24CE1007','kshitijbhate2024.comp@mmcoe.edu.in','12345678','Devgiri Boys Hostel','approved',NULL,'2026-09-22 10:25:27',1),(2,'Neel Kadam','B24CE1007','neelkadam2024.comp@mmcoe.edu.in','1234','Devgiri Boys Hostel','pending',NULL,'2026-09-23 15:01:59',1);
/*!40000 ALTER TABLE `pending_registrations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `role` enum('student','warden','chief_warden','college_authority','principal','maintenance','admin') NOT NULL,
  `prn` varchar(20) DEFAULT NULL,
  `email` varchar(100) DEFAULT NULL,
  `password` varchar(255) DEFAULT NULL,
  `block` varchar(100) DEFAULT NULL,
  `room` varchar(20) DEFAULT NULL,
  `block_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `prn` (`prn`),
  UNIQUE KEY `email` (`email`),
  KEY `block_id` (`block_id`),
  CONSTRAINT `users_ibfk_1` FOREIGN KEY (`block_id`) REFERENCES `hostel_blocks` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'Tushar','student','B24CE1001','tusharborate2024.comp@mmcoe.edu.in','12345678','Devgiri Boys Hostel','B-204',1),(2,'Mahesh','student','B24CE1009','maheshgaikwad2024.comp@mmcoe.edu.in','12345678','Devgiri Boys Hostel','B-118',1),(3,'Warden A','warden',NULL,'warden@replace-me.hostelcare.local',NULL,NULL,NULL,NULL),(4,'Chief Warden','chief_warden',NULL,'chiefwarden@replace-me.hostelcare.local',NULL,NULL,NULL,NULL),(5,'College Authority','college_authority',NULL,'authority@replace-me.hostelcare.local',NULL,NULL,NULL,NULL),(6,'Principal','principal',NULL,'principal@replace-me.hostelcare.local',NULL,NULL,NULL,NULL),(7,'Maintenance Staff A','maintenance',NULL,NULL,NULL,NULL,NULL,NULL),(8,'Maintenance Staff B','maintenance',NULL,NULL,NULL,NULL,NULL,NULL),(9,'Admin','admin',NULL,NULL,NULL,NULL,NULL,NULL),(10,'Kshitij Bhate','student','B24CE1007','kshitijbhate2024.comp@mmcoe.edu.in','12345678','Devgiri Boys Hostel','B-202',1);
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Temporary view structure for view `v_complaints_detailed`
--

DROP TABLE IF EXISTS `v_complaints_detailed`;
/*!50001 DROP VIEW IF EXISTS `v_complaints_detailed`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `v_complaints_detailed` AS SELECT 
 1 AS `complaint_id`,
 1 AS `title`,
 1 AS `description`,
 1 AS `category_name`,
 1 AS `sla_hours`,
 1 AS `severity`,
 1 AS `status`,
 1 AS `escalation_level`,
 1 AS `student_id`,
 1 AS `student_name`,
 1 AS `student_prn`,
 1 AS `student_room`,
 1 AS `block_name`,
 1 AS `assigned_to`,
 1 AS `assigned_staff_name`,
 1 AS `response_due_at`,
 1 AS `resolution_due_at`,
 1 AS `final_due_at`,
 1 AS `created_at`*/;
SET character_set_client = @saved_cs_client;

--
-- Temporary view structure for view `v_hostel_block_stats`
--

DROP TABLE IF EXISTS `v_hostel_block_stats`;
/*!50001 DROP VIEW IF EXISTS `v_hostel_block_stats`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `v_hostel_block_stats` AS SELECT 
 1 AS `block_name`,
 1 AS `total_complaints`,
 1 AS `pending_complaints`,
 1 AS `assigned_complaints`,
 1 AS `under_review_complaints`,
 1 AS `resolved_complaints`*/;
SET character_set_client = @saved_cs_client;

--
-- Dumping routines for database 'hostelcare'
--

--
-- Final view structure for view `v_complaints_detailed`
--

/*!50001 DROP VIEW IF EXISTS `v_complaints_detailed`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = cp850 */;
/*!50001 SET character_set_results     = cp850 */;
/*!50001 SET collation_connection      = cp850_general_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `v_complaints_detailed` AS select `c`.`id` AS `complaint_id`,`c`.`title` AS `title`,`c`.`description` AS `description`,coalesce(`cat`.`name`,`c`.`category`) AS `category_name`,`cat`.`sla_hours` AS `sla_hours`,`c`.`severity` AS `severity`,`c`.`status` AS `status`,`c`.`escalation_level` AS `escalation_level`,`c`.`student_id` AS `student_id`,`u_student`.`name` AS `student_name`,`u_student`.`prn` AS `student_prn`,`u_student`.`room` AS `student_room`,coalesce(`b`.`block_name`,`c`.`hostel_block`) AS `block_name`,`c`.`assigned_to` AS `assigned_to`,`u_staff`.`name` AS `assigned_staff_name`,`c`.`response_due_at` AS `response_due_at`,`c`.`resolution_due_at` AS `resolution_due_at`,`c`.`final_due_at` AS `final_due_at`,`c`.`created_at` AS `created_at` from ((((`complaints` `c` left join `users` `u_student` on((`c`.`student_id` = `u_student`.`id`))) left join `users` `u_staff` on((`c`.`assigned_to` = `u_staff`.`id`))) left join `complaint_categories` `cat` on((`c`.`category_id` = `cat`.`id`))) left join `hostel_blocks` `b` on((`c`.`block_id` = `b`.`id`))) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `v_hostel_block_stats`
--

/*!50001 DROP VIEW IF EXISTS `v_hostel_block_stats`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = cp850 */;
/*!50001 SET character_set_results     = cp850 */;
/*!50001 SET collation_connection      = cp850_general_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `v_hostel_block_stats` AS select coalesce(`b`.`block_name`,`c`.`hostel_block`,'Unknown') AS `block_name`,count(`c`.`id`) AS `total_complaints`,sum((case when (`c`.`status` = 'Pending') then 1 else 0 end)) AS `pending_complaints`,sum((case when (`c`.`status` = 'Assigned') then 1 else 0 end)) AS `assigned_complaints`,sum((case when (`c`.`status` = 'Under Review') then 1 else 0 end)) AS `under_review_complaints`,sum((case when (`c`.`status` = 'Resolved') then 1 else 0 end)) AS `resolved_complaints` from (`complaints` `c` left join `hostel_blocks` `b` on((`c`.`block_id` = `b`.`id`))) group by coalesce(`b`.`block_name`,`c`.`hostel_block`,'Unknown') */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-10-05 11:17:19
