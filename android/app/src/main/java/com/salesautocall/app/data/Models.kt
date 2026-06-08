package com.salesautocall.app.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class Profile(
    val id: String,
    @SerialName("company_id") val companyId: String? = null,
    @SerialName("full_name") val fullName: String? = null,
    val phone: String? = null,
    val role: String = "salesperson",
)

@Serializable
data class ImportBatch(
    val id: String? = null,
    @SerialName("company_id") val companyId: String,
    @SerialName("salesperson_id") val salespersonId: String,
    val filename: String? = null,
    val format: String? = null,
    @SerialName("total_rows") val totalRows: Int = 0,
    @SerialName("imported_rows") val importedRows: Int = 0,
    @SerialName("failed_rows") val failedRows: Int = 0,
)

@Serializable
data class Contact(
    val id: String? = null,
    @SerialName("company_id") val companyId: String,
    @SerialName("salesperson_id") val salespersonId: String? = null,
    @SerialName("import_batch_id") val importBatchId: String? = null,
    val name: String? = null,
    val phone: String,
    val email: String? = null,
    @SerialName("company_name") val companyName: String? = null,
    val notes: String? = null,
    val status: String = "new",
)

@Serializable
data class CallLog(
    val id: String? = null,
    @SerialName("company_id") val companyId: String,
    @SerialName("salesperson_id") val salespersonId: String,
    @SerialName("contact_id") val contactId: String? = null,
    val phone: String,
    val direction: String = "outgoing",
    val outcome: String? = null,
    @SerialName("started_at") val startedAt: String? = null,
    @SerialName("ended_at") val endedAt: String? = null,
    @SerialName("duration_seconds") val durationSeconds: Int = 0,
    @SerialName("sim_slot") val simSlot: Int? = null,
    val notes: String? = null,
)
