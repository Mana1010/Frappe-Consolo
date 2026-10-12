AFFECTED_SALES_INVOICES = [
    "SOA-RET-2025-145349",
    "SOA-RET-2025-145528",
    "SOA-RET-2025-145863",
    "SOA-RET-2025-148616",
    "SOA-RET-2025-149095",
    "SOA-RET-2025-149096",
    "SOA-RET-2025-149679",
    "SOA-RET-2025-151480",
    "SOA-RET-2025-151533",
    "SOA-RET-2025-151556",
    "SOA-RET-2025-151558",
    "SOA-RET-2025-151559",
    "SOA-RET-2025-151565",
    "SOA-RET-2025-151583",
    "SOA-RET-2025-142740",
    "SOA-RET-2025-145660",
    "SOA-RET-2025-147043",
    "SOA-RET-2025-147545",
    "SOA-RET-2025-149298",
    "SOA-RET-2025-149699",
    "SOA-RET-2025-149698",
    "SOA-RET-2025-151073",
    "SOA-RET-2025-151076",
    "SOA-RET-2025-151155",
    "SOA-RET-2025-151376",
    "SOA-RET-2025-151363",
    "SOA-RET-2025-143990",
    "SOA-RET-2025-144172",
    "SOA-RET-2025-144979"
]


def set_data(je, jea, gl, exchange_rate, grand_usd, grand_php):

    if not je.total_debit == grand_php or not je.total_credit == grand_php:
        log("The total debit and credit are correct")
        # Auto Created Journal Entry
        frappe.db.set_value('Journal Entry', je.name, {
            'total_credit': grand_php,
            'total_debit': grand_php
        })

    for item in gl:
        if (abs(item.credit) > 0):
            # Auto Created JE - GL Entry Payable Account
            frappe.db.set_value('GL Entry', item.name, {
                'credit_in_account_currency': grand_usd,
                'credit': grand_php,
            })

        if (abs(item.debit) > 0):
            log(item.debit)
            # Auto Created JE - GL Entry Clearing Account
            frappe.db.set_value('GL Entry', item.name, {
                'debit_in_account_currency': grand_usd,
                'debit': grand_php,
            })

    for item in jea:

        if (abs(item.debit) > 0):
            # Journal Entry Account - Clearing Account (Debit in Account Currency)
            frappe.db.set_value('Journal Entry Account', item.name, {
                'exchange_rate': soa_exchange_rate,
                'debit': grand_php,
                'debit_in_account_currency': grand_usd
            })

        if (abs(item.credit) > 0):
            # Journal Entry Account - Payable Account (Credit in Account Currency)
            frappe.db.set_value('Journal Entry Account', item.name, {
                'exchange_rate': soa_exchange_rate,
                'credit': grand_php,
                'credit_in_account_currency': grand_usd
            })


for item in AFFECTED_SALES_INVOICES:
    doc = frappe.get_doc("Sales Invoice", item)
    soa_exchange_rate = doc.get("conversion_rate")
    soa_usd_grand_total = doc.get("grand_total")
    soa_php_grand_total = soa_usd_grand_total * soa_exchange_rate

    journals = frappe.db.sql("""
        SELECT name, reversal_of, docstatus, total_debit, total_credit
        FROM `tabJournal Entry`
        WHERE parent_sales_invoice = %(item)s
    """, {"item": item}, as_dict=True)

    for je in journals:

        jea = frappe.db.sql("""
            SELECT name, account, debit, credit, exchange_rate
            FROM `tabJournal Entry Account`
            WHERE parent = %(je)s
        """, {"je": je.name}, as_dict=True)

        gl = frappe.db.sql("""
            SELECT name, account, debit, credit
            FROM `tabGL Entry`
            WHERE voucher_no = %(je)s
        """, {"je": je.name}, as_dict=True)

        set_data(je, jea, gl, soa_exchange_rate,
                 soa_usd_grand_total, soa_php_grand_total)
