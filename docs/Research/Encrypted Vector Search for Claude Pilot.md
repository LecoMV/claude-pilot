# **Deep Research Report: Architectural Paradigms for Zero-Knowledge and Encrypted Vector Search in Intelligent Development Environments**

## **1\. Executive Summary and Problem Context**

The emergence of "Claude Pilot" and similar intelligent coding assistants represents a paradigm shift in software engineering, moving from static analysis to semantic understanding. These systems rely fundamentally on Retrieval-Augmented Generation (RAG) architectures, where a user’s codebase is indexed, embedded into high-dimensional vectors, and stored in a vector database such as Qdrant. When a developer queries the system, the semantic intent is matched against this database to retrieve relevant context. However, this architecture introduces a profound privacy paradox. While the utility of the system scales with the depth of its access to proprietary source code, internal documentation, and sensitive configuration data, the standard deployment model requires the vector database to possess plaintext access to these embeddings to perform similarity calculations.

Recent research into "embedding inversion" has demonstrated that vector embeddings are not opaque cryptographic hashes but rather reversible semantic compressions. Adversaries with access to the vector space—whether through server compromise, insider threats, or side-channel attacks—can reconstruct the original proprietary source code with high fidelity.1 Consequently, for a tool targeting enterprise environments where intellectual property (IP) leakage is an existential risk, the standard "trust-us" model of cloud-hosted vector databases is increasingly untenable.

This report provides an exhaustive technical analysis of implementing a **Zero-Knowledge Architecture** for vector search, specifically tailored for the "Claude Pilot" ecosystem. In this context, "Zero-Knowledge" is defined as a system where the service provider (and by extension, any adversary compromising the server) possesses neither the decryption keys nor the mathematical capability to interpret the stored data or user queries.3 We rigorously evaluate two primary technological pathways to achieve this: **Fully Homomorphic Encryption (FHE)**, which enables computation on encrypted data, and **Trusted Execution Environments (TEEs)**, specifically AWS Nitro Enclaves and Intel SGX, which isolate plaintext computation in hardware-protected memory. Furthermore, we address the critical challenge of **Client-Side Key Management**, proposing a novel integration of OpenID Connect (OIDC) with the WebAuthn Pseudo-Random Function (PRF) extension to derive stable, hardware-backed encryption keys without exposing secrets to the backend.5

## ---

**2\. The Mechanics of Privacy in Semantic Search**

### **2.1 The Vulnerability of Plaintext Vector Indices**

To understand the necessity of encryption, one must first deconstruct the operation of a standard vector database. Systems like Qdrant, Weaviate, and Pinecone manage unstructured data by mapping it into a continuous vector space.7 In a typical "Claude Pilot" workflow, a snippet of code $C$ is passed through an embedding model (e.g., OpenAI’s text-embedding-3-small) to produce a vector $\\mathbf{v} \\in \\mathbb{R}^{1536}$.

The retrieval process relies on a similarity metric, most commonly Cosine Similarity, which measures the cosine of the angle between a query vector $\\mathbf{q}$ and a stored vector $\\mathbf{v}$.

$$\\text{similarity}(\\mathbf{q}, \\mathbf{v}) \= \\frac{\\mathbf{q} \\cdot \\mathbf{v}}{\\|\\mathbf{q}\\| \\|\\mathbf{v}\\|} \= \\frac{\\sum\_{i=1}^{n} q\_i v\_i}{\\sqrt{\\sum\_{i=1}^{n} q\_i^2} \\sqrt{\\sum\_{i=1}^{n} v\_i^2}}$$

To execute this query efficiently over millions of vectors, databases do not perform a brute-force scan. Instead, they utilize approximate nearest neighbor (ANN) indices, such as the Hierarchical Navigable Small World (HNSW) graph.9 The HNSW algorithm constructs a multi-layered graph where nodes (vectors) are linked by proximity. Navigating this graph requires the server to constantly compare distances between the query and candidate nodes to decide which edge to traverse next.  
In a plaintext architecture, the server must read the values of $\\mathbf{v}$ to compute these distances. If the server is compromised, the attacker gains access to the entire semantic map of the user's codebase. Moreover, because the index structure itself is built on semantic proximity, even the access patterns (i.e., which nodes are visited during a search) can leak information about the nature of the query.11

### **2.2 Defining the Zero-Knowledge Requirement**

A true zero-knowledge architecture for "Claude Pilot" demands that the server acts as a blind processor. The requirements are threefold:

1. **Indistinguishability:** The stored vectors must be indistinguishable from random noise to the server.
2. **Query Privacy:** The query vector sent by the client must be encrypted such that the server cannot determine its semantic content.
3. **Result Privacy:** The server should ideally not know which document was retrieved, or at the very least, should not be able to read the content of the retrieved document.1

Achieving this for _storage_ is trivial using standard encryption (e.g., AES-GCM). Achieving this for _search_ is exceptionally difficult because the server must perform the mathematical operations of sorting and distance calculation on data it cannot read.

## ---

**3\. Fully Homomorphic Encryption (FHE): The Cryptographic Frontier**

Fully Homomorphic Encryption (FHE) represents the theoretical "Holy Grail" of private computation. It allows arbitrary mathematical operations to be performed on ciphertexts, yielding an encrypted result that, when decrypted, matches the result of the operations performed on the plaintext.12

### **3.1 Zama Concrete ML and the TFHE Scheme**

The most promising development in practical FHE for machine learning is the **Concrete ML** library by Zama, which builds upon the **TFHE (Torus FHE)** scheme.12 Unlike earlier schemes that struggled with non-linear operations, TFHE introduces **Programmable Bootstrapping (PBS)**.

In FHE, every arithmetic operation adds "cryptographic noise" to the ciphertext. If this noise exceeds a certain threshold, the message becomes corrupted and undecryptable. Bootstrapping is the process of refreshing the ciphertext to reduce this noise. Zama’s innovation is to perform a table lookup during this bootstrapping step, effectively allowing the evaluation of non-linear functions (like activation functions or comparison operators) while simultaneously reducing noise.15

For "Claude Pilot," this is relevant because vector search requires two distinct types of operations:

1. **Linear Operations:** Calculating the dot product $\\mathbf{q} \\cdot \\mathbf{v}$. This is a sum of multiplications, which is relatively efficient in FHE.
2. **Non-Linear Operations:** Comparing the resulting scores (e.g., is $Score\_A \> Score\_B$?) to sort the results and identify the top-K matches. This relies heavily on PBS.17

### **3.2 Implementing Vector Search in Concrete ML**

Concrete ML provides a KNeighborsClassifier which can be adapted for retrieval tasks. The workflow for an encrypted search would be as follows:

1. **Client-Side Preparation:** The client embeds the code snippet and **normalizes** the vector. Normalization is crucial because it simplifies the cosine similarity formula to a pure dot product ($\\mathbf{A} \\cdot \\mathbf{B}$), eliminating the need to compute square roots and divisions (which are expensive in FHE) on the server.18
2. **Quantization:** FHE operations on 32-bit floating-point numbers are prohibitively slow. Concrete ML requires inputs to be quantized to integers, typically between 2 and 16 bits. For semantic search, 8-bit quantization is generally sufficient to maintain retrieval accuracy.14
3. **Encryption:** The quantized vector is encrypted using the user’s secret key and sent to the server.
4. **Server-Side Execution:** The server runs the FHE circuit. It computes the dot product of the encrypted query against the encrypted stored vectors. Crucially, because the server cannot see the values, it cannot use an index like HNSW. It must perform a **Linear Scan**—computing the distance to _every_ vector in the database.17
5. **Sorting:** The server uses PBS-based comparison operations to identify the encrypted indices of the closest vectors.
6. **Response:** The server returns the encrypted indices (and potentially the encrypted payloads) to the client for decryption.

### **3.3 The Hermes Architecture: Optimizing FHE Databases**

Recent research has introduced **Hermes**, a system designed to mitigate the performance penalties of FHE vector databases.20 Hermes leverages the **SIMD (Single Instruction, Multiple Data)** capabilities of lattice-based schemes like BFV.

In the Hermes architecture, a single ciphertext does not represent a single scalar value. Instead, it utilizes "packing" to encode a vector of plaintexts (slots) into a single polynomial. For a ring dimension of $N=8192$, Hermes can pack 4096 values into one ciphertext.21 This allows the server to perform the dot product operation on thousands of dimensions or thousands of distinct vectors in parallel with a single FHE instruction.

However, Hermes primarily optimizes **throughput** (amortized cost per query) rather than **latency** (time for a single query). The fundamental bottleneck remains: to ensure zero knowledge, the server must touch every record. If it skips a record based on an index, it learns something about the data (i.e., that the skipped record is _dissimilar_ to the query), violating the strict privacy model.22

### **3.4 Feasibility Assessment for Claude Pilot**

While FHE offers absolute cryptographic privacy without requiring trust in hardware, the performance implications are severe.

- **Latency:** Performing a cosine similarity search over a standard RAG dataset (e.g., 100,000 code snippets) using FHE would currently take seconds to minutes per query, compared to milliseconds for plaintext search.17
- **Scalability:** The necessity of a linear scan ($O(N)$ complexity) means that as the user's codebase grows, search time increases linearly. Standard databases scale logarithmically ($O(\\log N)$) using indices.
- **Conclusion:** FHE is currently suited only for extremely high-security, low-volume secrets management within Claude Pilot, but not for the primary code search engine.

## ---

**4\. Trusted Execution Environments (TEEs): The Pragmatic Solution**

Given the latency constraints of an interactive coding assistant, **Trusted Execution Environments (TEEs)**, also known as Confidential Computing, offer a viable alternative. TEEs isolate the computation in a hardware-protected area of memory (an enclave), preventing the operating system, hypervisor, or cloud provider from accessing the data.3

### **4.1 AWS Nitro Enclaves**

AWS Nitro Enclaves are particularly relevant for cloud-based deployments of Claude Pilot. Unlike earlier TEEs that were limited to small memory regions, Nitro Enclaves are full virtual machines carved out of a parent EC2 instance, supporting massive memory capacities (up to hundreds of GBs) which is essential for vector databases.25

**Architecture:**

- **Isolation:** The enclave has no persistent storage, no interactive access (SSH), and no external networking. It communicates solely with the parent instance via a local VSock channel.
- **Attestation:** The defining feature of the enclave is **Cryptographic Attestation**. When the enclave boots, the Nitro Security Module generates a signed document containing **PCR (Platform Configuration Register)** hashes. These hashes uniquely identify the kernel, filesystem, and application code running inside the enclave.27

### **4.2 Integrating Qdrant with Nitro Enclaves**

To deploy a zero-knowledge Qdrant instance for Claude Pilot, the following architecture is required:

1. **Image Construction:** The Qdrant binary and a minimal OS (e.g., Alpine Linux) are packaged into a Docker image. The nitro-cli tool converts this into an **Enclave Image File (EIF)**.26
2. **PCR Validation:** The client (Claude Pilot app) must possess the expected PCR hashes of the "honest" Qdrant build. Before sending any data, the client performs an attestation handshake, verifying that the remote enclave matches these hashes. This proves that the code running on the server has not been tampered with and does not include backdoors or logging mechanisms.
3. **Secure Tunneling:** Since the enclave cannot speak TCP/IP, a proxy on the parent instance forwards encrypted traffic to the enclave's VSock port. The TLS connection is terminated _inside_ the enclave, ensuring the parent instance sees only ciphertext.26
4. **Encrypted Indexing:**
   - The client sends the **Data Encryption Key (DEK)** to the enclave over the secure channel.
   - The enclave reads encrypted vector blobs from the parent's disk.
   - It decrypts them into its private RAM.
   - It builds a standard **HNSW index** in memory.
   - When a query arrives, it is decrypted inside the enclave, searched against the HNSW index at native speed ($O(\\log N)$), and the results are re-encrypted before being returned.9

### **4.3 Intel SGX and Gramine**

An alternative to Nitro is Intel SGX (Software Guard Extensions). SGX encrypts memory at the process level granularity. While historically limited by the Enclave Page Cache (EPC) size (often \<256MB), modern Xeon Scalable processors (Ice Lake, Sapphire Rapids) support terabytes of encrypted memory.30

To run Qdrant (a complex Rust application) in SGX, one typically uses a **Library OS** like **Gramine** (formerly Graphene).32 Gramine acts as a compatibility layer, translating Linux system calls into SGX-compatible operations and managing the encrypted memory. This allows "lifting and shifting" the Qdrant Docker container into an SGX enclave without rewriting the codebase.

**Real-World Example:** **Signal** utilizes SGX for its Private Contact Discovery service. To prevent the server from learning a user's social graph, the contact matching logic runs inside an enclave. Signal goes a step further by implementing **Oblivious RAM (ORAM)** algorithms inside the enclave to hide memory access patterns, ensuring that an attacker observing the memory bus cannot infer data relationships based on which addresses are accessed.11 While ORAM introduces significant overhead, using a TEE allows Signal to process millions of contacts with a high degree of privacy.

**Mirror Security** also implements a similar architecture with their "VectaX" solution, utilizing Qdrant inside a TEE to provide "Zero Exposure" vector search, effectively commercializing the architecture proposed here.34

## ---

**5\. Client-Side Identity and Key Management**

A zero-knowledge architecture is only as secure as its key management. If the encryption keys are stored on the server, or derived from low-entropy data known to the server, the system is compromised. The user query explicitly highlights the challenge of deriving keys from Single Sign-On (SSO) tokens.

### **5.1 The OIDC "Sub" Claim Vulnerability**

A naive implementation might derive the user's encryption key from the OpenID Connect (OIDC) sub (subject) claim (e.g., google-oauth2|10345...).

- **The Flaw:** The sub claim is a stable identifier, but it is **not a secret**. It is known to the Identity Provider (Google, Auth0), the application backend, and is often logged in plain text by proxies and firewalls.36
- **Consequence:** Deriving Key \= KDF(sub) allows anyone with the user's ID to recreate their key and decrypt their data.

### **5.2 Robust Derivation with HKDF (RFC 5869\)**

To derive a secure key, the system must utilize the **HMAC-based Extract-and-Expand Key Derivation Function (HKDF)**.38 HKDF allows combining a non-secret identifier (like the sub claim) with a high-entropy secret (Input Keying Material, IKM) to produce a cryptographically strong key.

- **Extract Step:** PRK \= HKDF-Extract(salt, IKM)
- **Expand Step:** OKM \= HKDF-Expand(PRK, info, length)

In this scheme, the OIDC sub claim should be used as the info parameter. This binds the derived key to the specific user context (preventing key substitution attacks) but does not contribute to the secrecy. The security relies entirely on the **IKM**.40

### **5.3 The WebAuthn PRF Extension: The Missing Link**

The critical missing piece in modern passwordless flows (like "Sign in with Google") is the source of the IKM. The user does not type a password, so there is no secret to hash.

The solution lies in the **Pseudo-Random Function (PRF)** extension of the WebAuthn (FIDO2) standard.5

- **Mechanism:** When a user authenticates with a passkey (e.g., TouchID, Windows Hello, YubiKey), the "Claude Pilot" client can pass a random salt to the authenticator.
- **Hardware Derivation:** The authenticator encrypts/hashes this salt using its internal, hardware-bound private key.
- **Output:** It returns a deterministic sequence of bytes. This output is unique to the specific hardware key and the specific service, but it is random and unknown to the server.
- **Integration:** This output serves as the **IKM** for the HKDF process described above.

**Browser Support (2025):**

- **Chrome/Edge:** Full support.
- **Safari:** Supported in macOS 15+ and iOS 18+ via iCloud Keychain.6
- **Firefox:** Support is currently experimental/lagging but expected to standardize.43

This enables a seamless UX: The developer logs in with their fingerprint, and "Claude Pilot" transparently derives the AES-256 keys needed to decrypt the vector database, without a password ever traversing the network.

### **5.4 Envelope Encryption Strategy**

To support multi-device access (where the PRF output will differ between the user's Laptop and Desktop), "Claude Pilot" must employ **Envelope Encryption**.44

1. **Data Encryption Key (DEK):** A random Master Key generated once. This key encrypts the vectors.
2. **Key Encryption Key (KEK):** Derived from the local device's PRF output.
3. **Key Wrapping:** The DEK is encrypted by the KEK (Wrapped_DEK \= Enc(KEK, DEK)) and stored on the server.
4. **Sync:** When adding a new device, the DEK is decrypted on the old device (or via a recovery flow) and re-encrypted with the new device's KEK. The server stores a list of Wrapped_DEK blobs, one for each authorized device.

## ---

**6\. Comparative Analysis: FHE vs. TEE vs. Client-Only**

The following analysis compares the feasible architectures for "Claude Pilot" based on a dataset of 1 million code vectors (approx. 1GB of data).

| Feature                  | Client-Side Indexing               | FHE (Concrete ML)      | TEE (AWS Nitro \+ Qdrant)          |
| :----------------------- | :--------------------------------- | :--------------------- | :--------------------------------- |
| **Search Algorithm**     | HNSW / Flat                        | Linear Scan            | HNSW (Approximate)                 |
| **Search Complexity**    | $O(\\log N)$                       | $O(N)$                 | $O(\\log N)$                       |
| **Latency (1M vectors)** | Low (but High RAM usage on client) | Very High (\> 10s)     | Low (\< 50ms)                      |
| **Throughput**           | Limited by Client CPU              | Very Low               | High (Server Grade)                |
| **Data Confidentiality** | **Absolute**                       | **Absolute**           | **Hardware-Rooted** (Trust Vendor) |
| **Key Location**         | Client Device                      | Client Device          | Ephemeral Enclave RAM              |
| **Side-Channel Risk**    | None                               | Low                    | Medium (Access Patterns)           |
| **Cost**                 | Free (Client Compute)              | High (Server CPU/Time) | Medium (EC2 costs)                 |

**Analysis:**

- **Client-Side Indexing:** Viable for personal projects (e.g., **Excalidraw** stores data locally or encrypted blobs 46), but fails to scale for enterprise codebases where the index exceeds client RAM or requires collaborative search.
- **FHE:** Offers the theoretical ideal but fails the latency requirement for an interactive "Pilot" tool. A 10-second lag for code completion is unacceptable.
- **TEE:** Represents the optimal trade-off. It provides cloud-scale performance and storage while maintaining a cryptographic boundary that excludes the cloud provider and the service operator.

## ---

**7\. Recommended Reference Architecture**

Based on this deep research, we propose the following architecture for "Claude Pilot".

### **7.1 System Components**

1. **Client (VS Code Extension / Desktop App):**
   - **Identity:** Implements OIDC flow with navigator.credentials.get({ extensions: { prf:... } }) to derive the KEK.47
   - **Encryption:** Uses AES-256-GCM to encrypt vectors before transmission. Uses Envelope Encryption to manage the DEK.
   - **Attestation:** Includes a lightweight verifier that checks the AWS Nitro Attestation Document signature and PCR0 hash before releasing the DEK.
2. **Backend (AWS):**
   - **Orchestrator:** A standard EC2 instance handling API routing, rate limiting, and persistent storage (EBS) management.
   - **Secure Search Node:** An **AWS Nitro Enclave** running a hardened, minimal Docker image containing **Qdrant**.
     - **Input:** Receives encrypted DEK and encrypted query vectors via VSock.
     - **Process:** Decrypts DEK (private RAM), Decrypts Index (private RAM), Executes Search.
     - **Output:** Returns IDs and Encrypted Snippets.

### **7.2 Implementation Roadmap**

1. **Phase 1: TEE Deployment.** Focus on dockerizing Qdrant and automating the EIF build process. Publish the Dockerfile to GitHub to allow community verification of the PCR hashes.
2. **Phase 2: OIDC PRF Integration.** Implement the authentication flow. Since PRF is still maturing in some browsers, implement a fallback using **PBKDF2** with a strong user password for environments where WebAuthn is unavailable.39
3. **Phase 3: Side-Channel Hardening.** As the product matures, consider implementing "dummy queries" (sending fake traffic to the enclave) to obfuscate traffic analysis patterns, mitigating network-level side channels.

### **7.3 Conclusion**

For "Claude Pilot," the "Zero-Knowledge" requirement is best met not by the mathematical purity of FHE, which is currently too slow, but by the hardware isolation of TEEs. By binding this secure enclave architecture with the emerging WebAuthn PRF standard for key management, it is possible to build a coding assistant that possesses the semantic intelligence of a centralized LLM while retaining the privacy properties of a local tool. This architecture ensures that the developer's code remains their own—mathematically inaccessible to the AI provider, the cloud host, and any malicious interceptor.

#### **Works cited**

1. Embedding Inversion \+ Encrypted Vector DB: The Future of Privacy ..., accessed January 17, 2026, [https://medium.com/@himansusaha/embedding-inversion-encrypted-vector-db-the-future-of-privacy-aware-rag-e0caf0985ee1](https://medium.com/@himansusaha/embedding-inversion-encrypted-vector-db-the-future-of-privacy-aware-rag-e0caf0985ee1)
2. Data Privacy with Qdrant: Implementing Role-Based Access Control (RBAC), accessed January 17, 2026, [https://qdrant.tech/articles/data-privacy/](https://qdrant.tech/articles/data-privacy/)
3. Zero-Knowledge Encryption Guide: Ultimate Data Privacy in 2025 | Hivenet, accessed January 17, 2026, [https://www.hivenet.com/post/zero-knowledge-encryption-the-ultimate-guide-to-unbreakable-data-security](https://www.hivenet.com/post/zero-knowledge-encryption-the-ultimate-guide-to-unbreakable-data-security)
4. Zero-Knowledge Security: Protecting Patient Privacy Through Client-Side Encryption, accessed January 17, 2026, [https://dev.to/wellallytech/zero-knowledge-security-protecting-patient-privacy-through-client-side-encryption-2onm](https://dev.to/wellallytech/zero-knowledge-security-protecting-patient-privacy-through-client-side-encryption-2onm)
5. Introducing Hardware-Backed Key Derivation with WebAuthn PRF and the YubiKey, accessed January 17, 2026, [https://developers.yubico.com/WebAuthn/Concepts/PRF_Extension/](https://developers.yubico.com/WebAuthn/Concepts/PRF_Extension/)
6. Passkeys & WebAuthn PRF for End-to-End Encryption (2026) \- Corbado, accessed January 17, 2026, [https://www.corbado.com/blog/passkeys-prf-webauthn](https://www.corbado.com/blog/passkeys-prf-webauthn)
7. Qdrant \- AWS Marketplace, accessed January 17, 2026, [https://aws.amazon.com/marketplace/seller-profile?id=seller-lfif47rtg3h4k](https://aws.amazon.com/marketplace/seller-profile?id=seller-lfif47rtg3h4k)
8. Weaviate Alternative for Vector Search \- Pinecone, accessed January 17, 2026, [https://www.pinecone.io/lp/weaviate/](https://www.pinecone.io/lp/weaviate/)
9. Qdrant 1.13 \- GPU Indexing, Strict Mode & New Storage Engine, accessed January 17, 2026, [https://qdrant.tech/blog/qdrant-1.13.x/](https://qdrant.tech/blog/qdrant-1.13.x/)
10. Why is KNN so much faster with cosine distance than Euclidean distance? \- Stack Overflow, accessed January 17, 2026, [https://stackoverflow.com/questions/67660866/why-is-knn-so-much-faster-with-cosine-distance-than-euclidean-distance](https://stackoverflow.com/questions/67660866/why-is-knn-so-much-faster-with-cosine-distance-than-euclidean-distance)
11. Technology Deep Dive: Building a Faster ORAM Layer for Enclaves \- Signal, accessed January 17, 2026, [https://signal.org/blog/building-faster-oram/](https://signal.org/blog/building-faster-oram/)
12. Zama Concrete ML: Simplifying Homomorphic Encryption for Python Machine Learning, accessed January 17, 2026, [https://www.python.org/success-stories/zama-concrete-ml-simplifying-homomorphic-encryption-for-python-machine-learning/](https://www.python.org/success-stories/zama-concrete-ml-simplifying-homomorphic-encryption-for-python-machine-learning/)
13. zama-ai/concrete: Concrete: TFHE Compiler that converts python programs into FHE equivalent \- GitHub, accessed January 17, 2026, [https://github.com/zama-ai/concrete](https://github.com/zama-ai/concrete)
14. zama-ai/concrete-ml: Concrete ML: Privacy Preserving ML framework using Fully Homomorphic Encryption (FHE), built on top of Concrete, with bindings to traditional ML frameworks. \- GitHub, accessed January 17, 2026, [https://github.com/zama-ai/concrete-ml](https://github.com/zama-ai/concrete-ml)
15. A systematic review of homomorphic encryption and its contributions in healthcare industry, accessed January 17, 2026, [https://pmc.ncbi.nlm.nih.gov/articles/PMC9062639/](https://pmc.ncbi.nlm.nih.gov/articles/PMC9062639/)
16. Making FHE Faster for ML: Beating our Previous Paper Benchmarks with Concrete ML, accessed January 17, 2026, [https://www.zama.org/post/making-fhe-faster-for-ml-beating-our-previous-paper-benchmarks-with-concrete-ml](https://www.zama.org/post/making-fhe-faster-for-ml-beating-our-previous-paper-benchmarks-with-concrete-ml)
17. Nearest neighbors | Concrete ML, accessed January 17, 2026, [https://docs.zama.org/concrete-ml/built-in-models/nearest-neighbors](https://docs.zama.org/concrete-ml/built-in-models/nearest-neighbors)
18. Using cosine distance with scikit learn KNeighborsClassifier \- Stack Overflow, accessed January 17, 2026, [https://stackoverflow.com/questions/34144632/using-cosine-distance-with-scikit-learn-kneighborsclassifier](https://stackoverflow.com/questions/34144632/using-cosine-distance-with-scikit-learn-kneighborsclassifier)
19. Relationship between Cosine Similarity and Euclidean Distance \- Ajay Patel, accessed January 17, 2026, [https://ajayp.app/posts/2020/05/relationship-between-cosine-similarity-and-euclidean-distance/](https://ajayp.app/posts/2020/05/relationship-between-cosine-similarity-and-euclidean-distance/)
20. Hermes: High-Performance Homomorphically Encrypted Vector Databases \- arXiv, accessed January 17, 2026, [https://arxiv.org/html/2506.03308v2](https://arxiv.org/html/2506.03308v2)
21. Hermes: High-Performance Homomorphically Encrypted Vector Databases \- ResearchGate, accessed January 17, 2026, [https://www.researchgate.net/publication/392406291_Hermes_High-Performance_Homomorphically_Encrypted_Vector_Databases](https://www.researchgate.net/publication/392406291_Hermes_High-Performance_Homomorphically_Encrypted_Vector_Databases)
22. \[2506.03308\] Hermes: High-Performance Homomorphically Encrypted Vector Databases, accessed January 17, 2026, [https://arxiv.org/abs/2506.03308](https://arxiv.org/abs/2506.03308)
23. Evaluation of Privacy-Preserving Support Vector Machine (SVM) Learning Using Homomorphic Encryption \- MDPI, accessed January 17, 2026, [https://www.mdpi.com/2410-387X/9/2/33](https://www.mdpi.com/2410-387X/9/2/33)
24. A few notes on AWS Nitro Enclaves: Images and attestation \- The Trail of Bits Blog, accessed January 17, 2026, [https://blog.trailofbits.com/2024/02/16/a-few-notes-on-aws-nitro-enclaves-images-and-attestation/](https://blog.trailofbits.com/2024/02/16/a-few-notes-on-aws-nitro-enclaves-images-and-attestation/)
25. AWS Nitro Enclaves, accessed January 17, 2026, [https://aws.amazon.com/ec2/nitro/nitro-enclaves/](https://aws.amazon.com/ec2/nitro/nitro-enclaves/)
26. Getting started with the Hello Enclaves sample application \- AWS Documentation, accessed January 17, 2026, [https://docs.aws.amazon.com/enclaves/latest/user/getting-started.html](https://docs.aws.amazon.com/enclaves/latest/user/getting-started.html)
27. Building zero trust generative AI applications in healthcare with AWS Nitro Enclaves, accessed January 17, 2026, [https://aws.amazon.com/blogs/compute/building-zero-trust-generative-ai-applications-in-healthcare-with-aws-nitro-enclaves/](https://aws.amazon.com/blogs/compute/building-zero-trust-generative-ai-applications-in-healthcare-with-aws-nitro-enclaves/)
28. Build AWS Nitro custom image and deploy to EKS cluster | by Selvakumar Rajendran, accessed January 17, 2026, [https://medium.com/@selvakumar.rajendran2011/build-aws-nitro-custom-image-and-deploy-to-eks-cluster-5a68b1b7e05a](https://medium.com/@selvakumar.rajendran2011/build-aws-nitro-custom-image-and-deploy-to-eks-cluster-5a68b1b7e05a)
29. Vector search overview \- Amazon MemoryDB, accessed January 17, 2026, [https://docs.aws.amazon.com/memorydb/latest/devguide/vector-search-overview.html](https://docs.aws.amazon.com/memorydb/latest/devguide/vector-search-overview.html)
30. Do any AWS machine have Intel sgx enabled in their hardware? \- Reddit, accessed January 17, 2026, [https://www.reddit.com/r/aws/comments/1ieb8t8/do_any_aws_machine_have_intel_sgx_enabled_in/](https://www.reddit.com/r/aws/comments/1ieb8t8/do_any_aws_machine_have_intel_sgx_enabled_in/)
31. Intel's New CPU Powers Faster Vector Search \- Qdrant, accessed January 17, 2026, [https://qdrant.tech/blog/qdrant-cpu-intel-benchmark/](https://qdrant.tech/blog/qdrant-cpu-intel-benchmark/)
32. Quick start \- Gramine documentation \- Read the Docs, accessed January 17, 2026, [https://gramine.readthedocs.io/en/v1.3/quickstart.html](https://gramine.readthedocs.io/en/v1.3/quickstart.html)
33. Gramine Demo: Running Unmodified Applications on Intel® SGX | Intel Software \- YouTube, accessed January 17, 2026, [https://www.youtube.com/watch?v=yBYzABMADCg](https://www.youtube.com/watch?v=yBYzABMADCg)
34. VectaX \- Mirror Security \- Qdrant, accessed January 17, 2026, [https://qdrant.tech/documentation/frameworks/mirror-security/](https://qdrant.tech/documentation/frameworks/mirror-security/)
35. Mirror Security's Journey with MongoDB: Elevating Vector Security for Enterprise AI, accessed January 17, 2026, [https://mirrorsecurity.io/blog/mirror-s-journey-with-mongodb-elevating-vector-security-for-enterprise-ai](https://mirrorsecurity.io/blog/mirror-s-journey-with-mongodb-elevating-vector-security-for-enterprise-ai)
36. OpenID Connect Core 1.0 incorporating errata set 2, accessed January 17, 2026, [https://openid.net/specs/openid-connect-core-1_0.html](https://openid.net/specs/openid-connect-core-1_0.html)
37. Recommendation ITU-T X.1285 (05/2025) \- OpenID Connect Core 1.0 \- Errata Set 2, accessed January 17, 2026, [https://www.itu.int/epublications/en/publication/itu-t-x-1285-2025-05-openid-connect-core-1-0-errata-set-2/en](https://www.itu.int/epublications/en/publication/itu-t-x-1285-2025-05-openid-connect-core-1-0-errata-set-2/en)
38. RFC 5869 \- HMAC-based Extract-and-Expand Key Derivation Function (HKDF), accessed January 17, 2026, [https://datatracker.ietf.org/doc/html/rfc5869](https://datatracker.ietf.org/doc/html/rfc5869)
39. Key derivation in .NET using HKDF | by Anthony Simmon \- Medium, accessed January 17, 2026, [https://medium.com/@asimmon/key-derivation-in-net-using-hkdf-4d36f7be71c4](https://medium.com/@asimmon/key-derivation-in-net-using-hkdf-4d36f7be71c4)
40. Best practices for key derivation \- The Trail of Bits Blog, accessed January 17, 2026, [https://blog.trailofbits.com/2025/01/28/best-practices-for-key-derivation/](https://blog.trailofbits.com/2025/01/28/best-practices-for-key-derivation/)
41. PRF WebAuthn and its role in passkeys \- Bitwarden, accessed January 17, 2026, [https://bitwarden.com/blog/prf-webauthn-and-its-role-in-passkeys/](https://bitwarden.com/blog/prf-webauthn-and-its-role-in-passkeys/)
42. A Developer's Guide to Deriving Keys with WebAuthn PRF and YubiKeys, accessed January 17, 2026, [https://developers.yubico.com/WebAuthn/Concepts/PRF_Extension/Developers_Guide_to_PRF.html](https://developers.yubico.com/WebAuthn/Concepts/PRF_Extension/Developers_Guide_to_PRF.html)
43. Add WebAuthn (PRF Extension) Support for Data Encryption/Decryption in Browser Vault · Issue \#4 · Gatewatcher/hoddor \- GitHub, accessed January 17, 2026, [https://github.com/Gatewatcher/hoddor/issues/4](https://github.com/Gatewatcher/hoddor/issues/4)
44. Protect Sensitive Data Using Client-Side Payload Encryption on Confluent Platform, accessed January 17, 2026, [https://docs.confluent.io/platform/current/security/protect-data/cspe.html](https://docs.confluent.io/platform/current/security/protect-data/cspe.html)
45. Pattern for access controlled client side encryption \- Information Security Stack Exchange, accessed January 17, 2026, [https://security.stackexchange.com/questions/236792/pattern-for-access-controlled-client-side-encryption](https://security.stackexchange.com/questions/236792/pattern-for-access-controlled-client-side-encryption)
46. End-to-End Encryption in the Browser \- Excalidraw Blog, accessed January 17, 2026, [https://plus.excalidraw.com/blog/end-to-end-encryption](https://plus.excalidraw.com/blog/end-to-end-encryption)
47. Web Authentication extensions \- Web APIs \- MDN Web Docs \- Mozilla, accessed January 17, 2026, [https://developer.mozilla.org/en-US/docs/Web/API/Web_Authentication_API/WebAuthn_extensions](https://developer.mozilla.org/en-US/docs/Web/API/Web_Authentication_API/WebAuthn_extensions)
48. SubtleCrypto: deriveKey() method \- Web APIs | MDN, accessed January 17, 2026, [https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey)
