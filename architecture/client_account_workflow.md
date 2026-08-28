The architecture of costumer accounts should be the following:

Org= orgnaisation
Orgnumber= VAT-number

1. Every account's main key is the Org number. However this is inputted and saved now, it should normalise all known versions of org-numbers in one common relaible back-end version to be used as key.

1.1 The child node of org-number are the different accounts that can be created for representatives of that organisation. Several representatives can use the same company number. Representatives have to have atleast an email and full name in their account credentials.

1.2 Accountes are created by representatives so when a represenatative creates an account, it first creates a parent account for the org-numer then a leaf is saved for that specific client. If an org already has an acocunt, creating another representative account to the same org just adds that account to the org. 

1.3 When accounts are deleted by represntatives, the representative account gets deleted. The org-number parent node stays intact even if the only representative delted themselves. 

1.4 admin can delete all sorts of accounts. Both parent organisation accounts (then their representatives get deleted) or individual representative accounts within an organisation.

